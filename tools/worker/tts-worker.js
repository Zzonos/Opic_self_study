/* OSS 음성 중계 서버 (Cloudflare Worker)
   웹 앱이 문장을 보내면 Microsoft Edge 읽어주기 음성(edge-tts와 같은 서비스)으로 mp3를 만들어 돌려줍니다.
   배포: Cloudflare 대시보드 → Workers & Pages → Create → Worker → 이 파일 내용 전체를 붙여넣고 Deploy.
   요청: POST { "text": "...", "voice": "en-US-AndrewMultilingualNeural", "rate": "-8%" } → audio/mpeg
   GET /voices → 사용 가능한 음성 이름 (점검용) */

const ALLOW_ORIGINS = ["https://zzonos.github.io", "http://localhost:8765", "http://127.0.0.1:8765"];
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "130.0.2849.68";
const WSS_HOST = "speech.platform.bing.com";
const VOICES = {
  m: ["en-US-AndrewMultilingualNeural", "-8%"],
  f: ["en-US-AvaMultilingualNeural", "-8%"],
  ko: ["ko-KR-SunHiNeural", "-5%"],
};
const MAX_CHARS = 1200;

function cors(origin) {
  const ok = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return { "Access-Control-Allow-Origin": ok, "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
}

async function secMsGec() {
  // edge-tts DRM: Windows file-time ticks rounded down to 5 minutes, hashed with the trusted token
  let ticks = Math.floor(Date.now() / 1000) + 11644473600;
  ticks -= ticks % 300;
  const str = `${ticks}0000000${TRUSTED_CLIENT_TOKEN}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function uuid() { return crypto.randomUUID().replace(/-/g, ""); }
function ts() { return new Date().toString().replace(/\(.*\)/, "(Coordinated Universal Time)"); }
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }

async function synthesize(text, voice, rate) {
  const gec = await secMsGec();
  const url = `https://${WSS_HOST}/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}&ConnectionId=${uuid()}`;
  const resp = await fetch(url, { headers: {
    "Upgrade": "websocket", "Connection": "Upgrade",
    "Pragma": "no-cache", "Cache-Control": "no-cache",
    "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    "Accept-Encoding": "gzip, deflate, br", "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_FULL_VERSION.split(".")[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_FULL_VERSION.split(".")[0]}.0.0.0`,
  }});
  const ws = resp.webSocket;
  if (!ws) throw new Error("websocket upgrade failed: " + resp.status + " " + (await resp.text()).slice(0, 200));
  ws.accept();
  const lang = voice.startsWith("ko") ? "ko-KR" : "en-US";
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='${lang}'><voice name='${voice}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${esc(text)}</prosody></voice></speak>`;
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 25000);
    ws.addEventListener("message", ev => {
      if (typeof ev.data === "string") {
        if (ev.data.includes("Path:turn.end")) { clearTimeout(timer); try { ws.close(); } catch (e) {} resolve(); }
        return;
      }
      const u8 = new Uint8Array(ev.data);
      const hlen = (u8[0] << 8) | u8[1];
      const header = new TextDecoder().decode(u8.subarray(2, 2 + hlen));
      if (header.includes("Path:audio")) chunks.push(u8.subarray(2 + hlen));
    });
    ws.addEventListener("error", e => { clearTimeout(timer); reject(new Error("ws error")); });
    ws.addEventListener("close", () => { clearTimeout(timer); resolve(); });
  });
  ws.send(`X-Timestamp:${ts()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } }) + "\r\n");
  ws.send(`X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts()}Z\r\nPath:ssml\r\n\r\n${ssml}`);
  await done;
  const total = chunks.reduce((a, c) => a + c.length, 0);
  if (!total) throw new Error("no audio");
  const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export default {
  async fetch(req) {
    const origin = req.headers.get("Origin") || "";
    const h = cors(origin);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/voices") return new Response(JSON.stringify(VOICES), { headers: { ...h, "Content-Type": "application/json" } });
    if (req.method !== "POST") return new Response("OSS TTS relay: POST {text, voice|tag, rate}", { headers: h });
    if (!ALLOW_ORIGINS.includes(origin)) return new Response("forbidden origin", { status: 403, headers: h });
    let body; try { body = await req.json(); } catch (e) { return new Response("bad json", { status: 400, headers: h }); }
    const text = String(body.text || "").trim();
    if (!text || text.length > MAX_CHARS) return new Response("text required (max " + MAX_CHARS + ")", { status: 400, headers: h });
    const preset = VOICES[body.tag] || null;
    const voice = body.voice || (preset ? preset[0] : VOICES.m[0]);
    const rate = body.rate || (preset ? preset[1] : "-8%");
    try {
      const audio = await synthesize(text, voice, rate);
      return new Response(audio, { headers: { ...h, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    } catch (e) {
      return new Response("tts failed: " + (e.message || e), { status: 502, headers: h });
    }
  }
};
