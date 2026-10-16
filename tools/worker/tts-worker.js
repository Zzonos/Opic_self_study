/* OSS 음성 중계 서버 (Cloudflare Worker)
   웹 앱이 문장을 보내면 Microsoft Edge 읽어주기 음성(edge-tts와 같은 서비스)으로 mp3를 만들어 돌려줍니다.
   배포: Cloudflare 대시보드 → Workers & Pages → Create → Worker → 이 파일 내용 전체를 붙여넣고 Deploy.
   요청: POST { "text": "...", "voice": "en-US-AndrewMultilingualNeural", "rate": "-8%" } → audio/mpeg
   GET /voices → 사용 가능한 음성 이름 (점검용)

   API 모드 (관리자 계정 전용, 선택):
   POST /ai        { kind, input, tier, stream } + Authorization: Bearer <Firebase ID 토큰> → Claude 응답 (SSE 스트림 또는 JSON)
   GET  /ai/status  + Authorization → 이번 달 사용액·한도
   설정 (Worker → Settings → Variables and Secrets):
     ANTHROPIC_API_KEY  (Secret, 필수)   Anthropic 콘솔에서 발급한 API 키
     API_EMAILS         (Text, 선택)     허용 이메일, 쉼표로 구분. 기본 zzono717@gmail.com
     AI_MONTHLY_KRW     (Text, 선택)     월 한도(원). 기본 10000
   월 한도를 Worker에서도 지키려면 KV 네임스페이스를 만들어 변수 이름 OSS_KV 로 연결하세요 (Bindings → KV namespace).
   KV가 없으면 Anthropic 콘솔의 월 지출 한도만으로 관리됩니다. */

const ALLOW_ORIGINS = ["https://zzonos.github.io", "http://localhost:8765", "http://127.0.0.1:8765"];
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75"; // keep in sync with edge-tts constants.py (token v2 since edge-tts 7.3.0)
const WSS_HOST = "speech.platform.bing.com";
const VOICES = {
  m: ["en-US-AndrewMultilingualNeural", "-8%"],
  f: ["en-US-EmmaMultilingualNeural", "-8%"], // Ava Multilingual stopped answering on 2026-10-14
  ko: ["ko-KR-SunHiNeural", "-5%"],
};
const MAX_CHARS = 1200;

function cors(origin) {
  const ok = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return { "Access-Control-Allow-Origin": ok, "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Expose-Headers": "X-Model", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
}

let clockSkew = 0; // seconds, corrected from Microsoft's Date header after a 403
// Sec-MS-GEC v2 token (port of edge-tts drm.py, 2026-10-13)
const GEC2 = (() => {
  const M = 0xFFFFFFFF;
  const u = x => x >>> 0;
  const INIT = [0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19];
  const STATE = [0xFD9FBEA2,0x91243CE7,0xBE499094,0xCD2E1E0A,0x6C006F49,0x04BD35AB,0xFEB0A7E4,0x03EFFBD2];
  const SCHED = [0xEB24BF9E,0x1558691F,0xA0C09EE2,0x0CFA32BA,0xA622EE8C,0xD1DD9491,0xC0DD25A0,0xF9E70AB6,0xF0C31573,0x7058CE4E,0x7188E606,0x00E5AB33,0xD258B060,0x72766564];
  const K = [0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0x0FC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x06CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2];
  const ADJ = 0xC9DC06A7;
  const KB = K.slice(0, 14).concat([ADJ], K.slice(15));
  const S0ADJ = 0x059C0B80, S1ADJ = 0x000B92C0;
  const CS = [[0xE82E91B1,0xB32700D0],[0x44DE24C6,0x88DFF51D],[0x3BEB65BC,0x29514038],[0xC89C5933,0xB328CBDF],[0x8D1EC211,0xD405B4D5],[0x314EF5D5,0x26E55F3C],[0xE92491B1,0x607801C6],[0xF0A5B9D5,0x82B2C1FB],[0x06064CF3,0xFA51A3DA],[0xDA79FA60,0x207CC464],[0xBED20560,0x3C3C74F3],[0x89F9C9F8,0xD2D14B61],[0x35FA38C6,0xBB04A2C1],[0xCB49E3C6,0xC5626167]];
  const FACTOR = 0x82893933, CA0 = 0xF2F90B1A, CA1 = 0x0B1A0000;
  const rotr = (x, n) => u((x >>> n) | (x << (32 - n)));
  const rol16 = x => u((x << 16) | (x >>> 16));
  const mul = (a, b) => u(Math.imul(a, b));
  const sig0 = x => u(rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3));
  const sig1 = x => u(rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10));
  function rounds(state, w, first = 0) {
    let [a, b, c, d, e, f, g, h] = state; const k = first === 14 ? KB : K;
    for (let i = first; i < 64; i++) {
      const t1 = u(h + u(rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + u(g ^ (e & (f ^ g))) + k[i] + w[i]);
      const t2 = u(u(rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + u((a & b) | (c & (a | b))));
      h = g; g = f; f = e; e = u(d + t1); d = c; c = b; b = a; a = u(t1 + t2);
    }
    return [a, b, c, d, e, f, g, h];
  }
  function expand(w, from = 16) { for (let i = from; i < 64; i++) w[i] = u(sig1(w[i - 2]) + w[i - 7] + sig0(w[i - 15]) + w[i - 16]); }
  const be32 = (d, o) => u((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]);
  function init(d7) {
    const w = new Array(14).fill(0);
    w.push(u((d7[0] << 16) | (d7[1] << 8) | d7[2]));
    w.push(be32(d7, 3));
    for (let i = 16; i < 30; i++) {
      let v = SCHED[i - 16];
      if (i - 2 >= 14) v += i === 16 ? u(sig1(w[i - 2]) ^ S1ADJ) : sig1(w[i - 2]);
      if (i - 7 >= 14) v += w[i - 7];
      if (i - 15 >= 14) v += i === 29 ? u(sig0(w[i - 15]) ^ S0ADJ) : sig0(w[i - 15]);
      w.push(u(v % 4294967296));
    }
    w.push(u(((sig1(w[28]) + w[23] + sig0(w[15]) + w[14] + ADJ - K[14]) % 4294967296 + 4294967296) % 4294967296));
    expand(w, 31);
    const wk = rounds(STATE, w, 14);
    return INIT.map((x, i) => u(x + wk[i]));
  }
  function sha(data) {
    const len = 57 + data.length;
    const padLen = ((55 - len) % 64 + 64) % 64;
    const rest = data.slice(7);
    const p = new Uint8Array(rest.length + 1 + padLen + 8);
    p.set(rest); p[rest.length] = 0x80;
    const bits = len * 8; const dv = new DataView(p.buffer);
    dv.setUint32(p.length - 8, Math.floor(bits / 4294967296)); dv.setUint32(p.length - 4, bits >>> 0);
    let st = init(data.slice(0, 7));
    for (let o = 0; o < p.length; o += 64) {
      const w = []; for (let i = 0; i < 16; i++) w.push(dv.getUint32(o + i * 4));
      expand(w); const wk = rounds(st, w); st = st.map((x, i) => u(x + wk[i]));
    }
    const out = new Uint8Array(32); const ov = new DataView(out.buffer); st.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
  }
  function cs64(data, dg) {
    const dv = new DataView(dg.buffer, dg.byteOffset);
    let ka = u(dv.getUint32(0, true) | 1), kb = u(dv.getUint32(4, true) | 1);
    const fac = [mul(ka, FACTOR), mul(kb, FACTOR)];
    const terms = CS.map(([c], i) => mul(c, fac[i % 2]));
    const offs = CS.map(([, o]) => o);
    // little-endian words of (0x00 + data), zero padded to an even count
    const src = new Uint8Array(1 + data.length); src.set(data, 1);
    const plen = src.length + ((4 - src.length % 4) % 4); const pb = new Uint8Array(plen); pb.set(src);
    const pv = new DataView(pb.buffer); const words = []; for (let i = 0; i < plen; i += 4) words.push(pv.getUint32(i, true));
    if (words.length % 2) words.push(0);
    words.forEach((wd, i) => {
      let term = mul(wd, i % 2 === 0 ? ka : kb);
      let off = mul(rol16(wd), i % 2 === 0 ? 0xEF0569FB : 0xC31713DB);
      if (i === 0) { term = u(term + mul(CA0, fac[0])); off = u(off + CA1); }
      terms.push(term); offs.push(off);
    });
    let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
    for (let i = 0; i < terms.length; i += 2) {
      const x = terms[i], y = terms[i + 1];
      let t = rol16(u(offs[i] + x)); let q = mul(t, 0x76F50F34);
      swapAcc = u(swapAcc + u(mul(rol16(q), 0xC3EFEA97) + q));
      t = rol16(u(offs[i + 1] + y)); q = mul(t, 0x1881CE3C);
      swapLast = u(mul(rol16(q), 0x35BD1EC9) + q);
      swapAcc = u(swapAcc + swapLast);
      state = u(mul(state, ka) + x);
      state = mul(rol16(state), 0xCF98B111); state = mul(rol16(state), 0x87085B9F);
      state = mul(rol16(state), 0x12CEB96D); state = mul(rol16(state), 0x257E1D83);
      acc = u(acc + state);
      t = u(mul(state, kb) + y); t = mul(rol16(t), 0xA27416F5); t = mul(rol16(t), 0xD38396FF);
      state = mul(rol16(mul(rol16(t), 0x7C932B89)), 0xBFA49F69);
      acc = u(acc + state);
    }
    return [u(swapLast ^ state), u(swapAcc ^ acc)];
  }
  const hex = b => [...b].map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  return function gec2(unixSeconds, token) {
    let t = Math.floor(unixSeconds) + 11644473600; t -= t % 300;
    const ticks = (BigInt(t) * 10000000n).toString();
    const data = new TextEncoder().encode(ticks + token);
    const dg = sha(data); const [p, q] = cs64(data, dg);
    const c = new Uint8Array(8); const cv = new DataView(c.buffer); cv.setUint32(0, p, true); cv.setUint32(4, q, true);
    return hex(c) + "-" + hex(dg);
  };
})();

async function secMsGec() {
  // Microsoft switched to v2 tokens on 2026-10-13 (edge-tts 7.3.0): custom SHA-256 + CS64 digest of the 5-minute Windows tick
  return GEC2(Date.now() / 1000 + clockSkew, TRUSTED_CLIENT_TOKEN);
}

function uuid() { return crypto.randomUUID().replace(/-/g, ""); }
function ts() { return new Date().toString().replace(/\(.*\)/, "(Coordinated Universal Time)"); }
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }

function muid() { return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase(); }

async function openSocket() {
  const gec = await secMsGec();
  const url = `https://${WSS_HOST}/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=2-${CHROMIUM_FULL_VERSION}&ConnectionId=${uuid()}`;
  const major = CHROMIUM_FULL_VERSION.split(".")[0];
  const resp = await fetch(url, { headers: {
    "Upgrade": "websocket", "Connection": "Upgrade", "Sec-WebSocket-Version": "13",
    "Pragma": "no-cache", "Cache-Control": "no-cache",
    "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    "Accept-Encoding": "gzip, deflate, br, zstd", "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
    "Cookie": `muid=${muid()};`,
  }});
  return resp;
}

async function synthesize(text, voice, rate) {
  let resp = await openSocket();
  // Microsoft refuses some requests from Cloudflare with 403: fix clock skew once, then simply try again a few times
  for (let k = 0; k < 5 && !resp.webSocket && resp.status === 403; k++) {
    if (k === 0) { const d = Date.parse(resp.headers.get("Date") || ""); if (!isNaN(d)) clockSkew += (d - Date.now()) / 1000; }
    await new Promise(r => setTimeout(r, 150 * (k + 1)));
    resp = await openSocket();
  }
  const ws = resp.webSocket;
  if (!ws) throw new Error("websocket upgrade failed: " + resp.status + " " + (await resp.text()).slice(0, 200));
  ws.accept();
  const lang = voice.startsWith("ko") ? "ko-KR" : "en-US";
  // the service wants the long voice name (same conversion as edge-tts)
  const m = /^([a-z]{2,}-[A-Z]{2,})-(.+)$/.exec(voice);
  const full = voice.startsWith("Microsoft") || !m ? voice : `Microsoft Server Speech Text to Speech Voice (${m[1]}, ${m[2]})`;
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${full}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${esc(text)}</prosody></voice></speak>`;
  const chunks = [];
  const notes = []; // text frames / close info, returned in the error for diagnosis
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 25000);
    ws.addEventListener("message", ev => {
      if (typeof ev.data === "string") {
        const p = (/Path:([^\r\n]+)/.exec(ev.data) || [])[1] || "?";
        if (notes.length < 6) notes.push(p === "turn.end" || p === "turn.start" || p === "response" ? p : ev.data.slice(0, 160));
        if (ev.data.includes("Path:turn.end")) { clearTimeout(timer); try { ws.close(); } catch (e) {} resolve(); }
        return;
      }
      // binary frame: may arrive as ArrayBuffer, a typed array, or a Blob depending on the runtime
      const d = ev.data;
      const p = (d && typeof d.arrayBuffer === "function" && !(d instanceof ArrayBuffer)) ? d.arrayBuffer()
        : Promise.resolve(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
      chunks.push(p.then(buf => {
        const u8 = new Uint8Array(buf);
        const hlen = (u8[0] << 8) | u8[1];
        const header = new TextDecoder().decode(u8.subarray(2, 2 + hlen));
        return header.includes("Path:audio") ? u8.subarray(2 + hlen) : null;
      }));
    });
    ws.addEventListener("error", e => { clearTimeout(timer); reject(new Error("ws error")); });
    ws.addEventListener("close", ev => { notes.push("close " + ev.code + " " + (ev.reason || "")); clearTimeout(timer); resolve(); });
  });
  ws.send(`X-Timestamp:${ts()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } }) + "\r\n");
  ws.send(`X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts()}Z\r\nPath:ssml\r\n\r\n${ssml}`);
  await done;
  const parts = (await Promise.all(chunks)).filter(Boolean);
  chunks.length = 0; chunks.push(...parts);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  if (!total) throw new Error("no audio [" + notes.join(" | ") + "]");
  const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/* ================= API mode: Firebase ID token gate + Claude relay ================= */
const FIREBASE_PROJECT = "opic-self-study";
const DEFAULT_EMAILS = ["zzono717@gmail.com"];
const KRW_PER_USD = 1400;
// model per feature (quick tier always goes to Haiku)
const MODELS = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };
const PRICE = { "claude-haiku-5-5": [0.10, 0.50], "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20] }; // USD per 1M tokens (in, out)
const ROUTE = { chat: "haiku", trans: "haiku", other: "haiku", eval: "sonnet", mock: "sonnet", coach: "sonnet", script: "sonnet" };
const MAX_OUT = { chat: 800, other: 2000, trans: 6000, eval: 4096, mock: 6000, coach: 5000, script: 8000 };

let JWKS = null, JWKS_AT = 0;
async function googleKeys(force) {
  if (!force && JWKS && Date.now() - JWKS_AT < 3600e3) return JWKS;
  const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  JWKS = (await r.json()).keys || []; JWKS_AT = Date.now(); return JWKS;
}
function b64u(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
async function verifyIdToken(tok) {
  const [h64, p64, s64] = String(tok || "").split(".");
  if (!s64) throw new Error("no token");
  const hdr = JSON.parse(new TextDecoder().decode(b64u(h64)));
  const pl = JSON.parse(new TextDecoder().decode(b64u(p64)));
  if (hdr.alg !== "RS256") throw new Error("alg");
  let jwk = (await googleKeys()).find(k => k.kid === hdr.kid);
  if (!jwk) jwk = (await googleKeys(true)).find(k => k.kid === hdr.kid);
  if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s64), new TextEncoder().encode(h64 + "." + p64));
  const now = Date.now() / 1000;
  if (!ok) throw new Error("signature");
  if (pl.aud !== FIREBASE_PROJECT || pl.iss !== "https://securetoken.google.com/" + FIREBASE_PROJECT) throw new Error("project");
  if (!(pl.exp > now) || !(pl.iat < now + 300) || !pl.sub) throw new Error("expired");
  return pl;
}
async function gate(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  if (!m) return { err: [401, "login required"] };
  let pl; try { pl = await verifyIdToken(m[1]); } catch (e) { return { err: [401, "invalid token: " + e.message] }; }
  const allow = String(env.API_EMAILS || DEFAULT_EMAILS.join(",")).toLowerCase().split(/[,\s]+/).filter(Boolean);
  const email = String(pl.email || "").toLowerCase();
  if (!email || !allow.includes(email)) return { err: [403, "not allowed for this account"] };
  return { email };
}
const monthKey = () => { const d = new Date(Date.now() + 9 * 3600e3); return "spend:" + d.toISOString().slice(0, 7); }; // KST month
const limitUSD = env => (+env.AI_MONTHLY_KRW || 10000) / KRW_PER_USD;
async function spent(env) { if (!env.OSS_KV) return null; return (+(await env.OSS_KV.get(monthKey())) || 0) / 1e6; }
async function addSpend(env, usd) { if (!env.OSS_KV || !(usd > 0)) return; const k = monthKey(); const cur = +(await env.OSS_KV.get(k)) || 0; await env.OSS_KV.put(k, String(Math.round(cur + usd * 1e6)), { expirationTtl: 3600 * 24 * 70 }); }
const costOf = (model, inT, outT) => { const p = PRICE[model] || PRICE[MODELS.sonnet]; return (inT * p[0] + outT * p[1]) / 1e6; };

async function aiRoute(req, env, ctx, h, url) {
  const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...h, "Content-Type": "application/json" } });
  const g = await gate(req, env);
  if (g.err) return J({ error: g.err[1] }, g.err[0]);
  if (!env.ANTHROPIC_API_KEY) return J({ error: "ANTHROPIC_API_KEY is not set on the worker" }, 500);
  const used = await spent(env);
  if (req.method === "GET") return J({ ok: true, email: g.email, spentUSD: used, limitUSD: limitUSD(env), kv: !!env.OSS_KV, models: MODELS, route: ROUTE });
  if (used != null && used >= limitUSD(env)) return J({ error: "monthly budget reached", spentUSD: used, limitUSD: limitUSD(env) }, 402);
  let body; try { body = await req.json(); } catch (e) { return J({ error: "bad json" }, 400); }
  const kind = ROUTE[body.kind] ? body.kind : "other";
  const fam = body.tier === "quick" ? "haiku" : body.tier === "complex" ? "opus" : ROUTE[kind];
  const model = MODELS[fam];
  const input = body.input;
  const messages = Array.isArray(input) ? input.filter(t => t && (t.role === "user" || t.role === "assistant")).map(t => ({ role: t.role, content: String(t.content || "") })) : [{ role: "user", content: String(input || "") }];
  if (!messages.length || messages[messages.length - 1].role !== "user") return J({ error: "input must end with a user turn" }, 400);
  if (JSON.stringify(messages).length > 400000) return J({ error: "input too large" }, 413);
  const stream = body.stream !== false;
  const up = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: MAX_OUT[kind], messages, stream }) });
  if (!up.ok) return J({ error: "anthropic " + up.status + ": " + (await up.text()).slice(0, 300) }, up.status === 429 ? 429 : 502);
  if (!stream) { const j = await up.json(); const u = j.usage || {}; ctx.waitUntil(addSpend(env, costOf(model, (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), u.output_tokens || 0)));
    return J({ text: (j.content || []).filter(b => b.type === "text").map(b => b.text).join(""), stop: j.stop_reason, model, usage: u }); }
  // stream the SSE straight through, reading token usage on the way to keep the monthly total
  let buf = "", inT = 0, outT = 0; const dec = new TextDecoder(); let done; ctx.waitUntil(new Promise(r => done = r));
  const ts = new TransformStream({
    transform(chunk, c) { c.enqueue(chunk); buf += dec.decode(chunk, { stream: true }); let i;
      while ((i = buf.indexOf("\n\n")) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); const line = ev.split("\n").find(l => l.startsWith("data:")); if (!line) continue;
        try { const d = JSON.parse(line.slice(5)); if (d.type === "message_start") { const u = d.message.usage || {}; inT = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); outT = u.output_tokens || 0; } else if (d.type === "message_delta" && d.usage) outT = d.usage.output_tokens || outT; } catch (e) { } } },
    async flush() { try { await addSpend(env, costOf(model, inT, outT)); } finally { done(); } }
  });
  return new Response(up.body.pipeThrough(ts), { headers: { ...h, "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Model": model } });
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin") || "";
    const h = cors(origin);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    if (url.pathname === "/ai" || url.pathname === "/ai/status") {
      if (!ALLOW_ORIGINS.includes(origin)) return new Response("forbidden origin", { status: 403, headers: h });
      try { return await aiRoute(req, env || {}, ctx || { waitUntil() { } }, h, url); } catch (e) { return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: { ...h, "Content-Type": "application/json" } }); }
    }
    if (req.method === "GET" && url.pathname === "/voices") return new Response(JSON.stringify({ ...VOICES, gec: 2 }), { headers: { ...h, "Content-Type": "application/json" } });
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
