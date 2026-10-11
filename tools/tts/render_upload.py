#!/usr/bin/env python3
"""OSS 예시·내 스크립트 문장을 Microsoft 신경망 음성(edge-tts)으로 녹음해 내 OSS 계정(Firebase)에 올립니다.

준비 (한 번만):
    pip install edge-tts requests
    이 파일 옆에 config.json 을 만들고  {"email": "OSS 계정 이메일", "password": "비밀번호"}  를 적습니다.
실행:
    python render_upload.py          # 녹음 안 된 문장만 녹음 + 업로드
    python render_upload.py --force  # 전부 다시 녹음
결과:
    - 계정의 users/<uid>/clips/<hash> 문서에 m/f(영어)·ko(해석) mp3 저장 → 웹 앱이 자동으로 사용
    - 이 파일 옆 out/s/{m,f,ko}/<hash>.mp3 + manifest.json 도 생성 → Claude 앱에 올릴 때 사용
"""
import asyncio, base64, json, pathlib, re, sys, time
try:
    import edge_tts, requests
except ImportError:
    print("edge-tts / requests 가 없습니다. 먼저  pip install edge-tts requests  를 실행하세요."); sys.exit(1)

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out" / "s"
API_KEY = "AIzaSyAkIuOOuG_MUlgE3GRrqlC3THnVcZHeq8M"
PROJECT = "opic-self-study"
FS = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
VOICES = {"m": ("en-US-AndrewMultilingualNeural", "-8%"), "f": ("en-US-AvaMultilingualNeural", "-8%"), "ko": ("ko-KR-SunHiNeural", "-5%")}
FORCE = "--force" in sys.argv

# ---- 앱과 똑같은 문장 분리 / 해시 (artifact.html의 splitSent, txtHash 포팅) ----
def split_sent(t):
    t = re.sub(r"\s+", " ", t or "")
    return [x.strip() for x in re.findall(r"[^.!?]+[.!?]+[\"']?|[^.!?]+$", t) if x.strip()]

def txt_hash(t):
    x = re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()
    h = 5381
    for ch in x:
        h = (((h * 33) & 0xFFFFFFFF) ^ ord(ch)) & 0xFFFFFFFF
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"; s = ""
    while h: s = digits[h % 36] + s; h //= 36
    return s or "0"

# ---- Firebase REST ----
def login(email, password):
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
                      json={"email": email, "password": password, "returnSecureToken": True}, timeout=30)
    if r.status_code != 200: print("로그인 실패:", r.json().get("error", {}).get("message")); sys.exit(1)
    j = r.json(); return j["idToken"], j["localId"]

def fs_get(path, token, params=None):
    r = requests.get(f"{FS}/{path}", headers={"Authorization": f"Bearer {token}"}, params=params or {}, timeout=60)
    return r

def fs_patch(path, token, fields):
    r = requests.patch(f"{FS}/{path}", headers={"Authorization": f"Bearer {token}"}, json={"fields": fields}, timeout=120)
    if r.status_code != 200: print("  업로드 실패", path, r.status_code, r.text[:200]); return False
    return True

def existing_hashes(uid, token):
    have = set(); page = None
    while True:
        params = {"pageSize": 300, "mask.fieldPaths": "h"}
        if page: params["pageToken"] = page
        r = fs_get(f"users/{uid}/clips", token, params)
        if r.status_code != 200: break
        j = r.json()
        for d in j.get("documents", []): have.add(d["name"].rsplit("/", 1)[-1])
        page = j.get("nextPageToken")
        if not page: break
    return have

async def tts(text, voice, rate, path):
    for attempt in range(3):
        try:
            await edge_tts.Communicate(text, voice, rate=rate).save(str(path)); return True
        except Exception as e:
            print("  재시도:", e); await asyncio.sleep(2)
    return False

async def main():
    cfg_path = HERE / "config.json"
    if not cfg_path.exists():
        print("config.json 이 없습니다. 이 파일 옆에 {\"email\": \"...\", \"password\": \"...\"} 형식으로 만들어 주세요."); sys.exit(1)
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    token, uid = login(cfg["email"], cfg["password"])
    print("로그인 OK:", cfg["email"])
    r = fs_get(f"users/{uid}", token)
    if r.status_code != 200: print("계정 데이터를 읽지 못했어요. 웹 앱에서 '웹으로 통합'을 먼저 한 번 해 주세요."); sys.exit(1)
    state = json.loads(r.json().get("fields", {}).get("state", {}).get("stringValue") or "{}")
    trans = state.get("trans", {})
    sents = {}
    for store in ("samples", "scripts"):
        for tid, sc in (state.get(store) or {}).items():
            for x in (sc.get("scripts") or []):
                for sn in split_sent(x.get("answer", "")):
                    sents[txt_hash(sn)] = sn
    for q, m in (state.get("models") or {}).items():
        for sn in split_sent(m): sents[txt_hash(sn)] = sn
    print(f"스크립트 문장 {len(sents)}개 (예시·내 스크립트·모범답안)")
    have = set() if FORCE else existing_hashes(uid, token)
    todo = {h: s for h, s in sents.items() if h not in have}
    print(f"녹음할 문장 {len(todo)}개 (이미 있음 {len(sents) - len(todo)}개)")
    for tag in VOICES: (OUT / tag).mkdir(parents=True, exist_ok=True)
    man = {tag: (json.loads((OUT / tag / "manifest.json").read_text()) if (OUT / tag / "manifest.json").exists() else {}) for tag in VOICES}
    done = 0; t0 = time.time()
    for h, sn in todo.items():
        fields = {"h": {"stringValue": h}, "en": {"stringValue": sn}, "t": {"integerValue": str(int(time.time() * 1000))}}
        ko = trans.get(sn, "")
        for tag, (voice, rate) in VOICES.items():
            text = ko if tag == "ko" else sn
            if not text: continue
            p = OUT / tag / f"{h}.mp3"
            if FORCE or not p.exists():
                if not await tts(text, voice, rate, p): continue
            fields[tag] = {"bytesValue": base64.b64encode(p.read_bytes()).decode()}
            man[tag][h] = round(p.stat().st_size / 1000)
        if fs_patch(f"users/{uid}/clips/{h}", token, fields): done += 1
        if done % 10 == 0 and done:
            print(f"  {done}/{len(todo)} ({int(time.time() - t0)}초)")
            for tag in VOICES: (OUT / tag / "manifest.json").write_text(json.dumps(man[tag]), encoding="utf-8")
    for tag in VOICES: (OUT / tag / "manifest.json").write_text(json.dumps(man[tag]), encoding="utf-8")
    # 색인 문서: 웹 앱이 어떤 문장에 클립이 있는지 한 번에 알 수 있게
    allh = sorted(have | set(todo.keys()))
    fs_patch(f"users/{uid}/meta/clipidx", token, {"hashes": {"arrayValue": {"values": [{"stringValue": h} for h in allh]}}, "t": {"integerValue": str(int(time.time() * 1000))}})
    print(f"완료: {done}개 녹음·업로드, 총 {len(allh)}개 문장에 클립 있음 → {OUT}")

if __name__ == "__main__":
    asyncio.run(main())
