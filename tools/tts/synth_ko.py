import re, subprocess, os, wave, sys
import numpy as np, onnxruntime as rt
B = "/tmp/claude-0/-home-claude/5f4cd580-33e9-5483-b159-456aab58962c/scratchpad"
ESP = f"{B}/kk/esp/bin/espeak-ng"; ESPD = f"{B}/kk/esp/share/espeak-ng-data"
D = f"{B}/ko/vits-mimic3-ko_KO-kss_low"
TOK = {}
for line in open(f"{D}/tokens.txt", encoding="utf-8"):
    if line.rstrip("\n") == " 0": TOK[" "] = 0; continue
    parts = line.rstrip("\n").split(" ")
    if len(parts) == 2: TOK[parts[0]] = int(parts[1])
sess = rt.InferenceSession(f"{D}/ko_KO-kss_low.onnx", providers=["CPUExecutionProvider"])
SR = 22050

_cache = {}
def ph_word(w):
    if w not in _cache:
        r = subprocess.run([ESP, f"--path={ESPD}", "-q", "--ipa", "-v", "ko", w], capture_output=True, text=True)
        _cache[w] = "".join(r.stdout.split()).replace("͡", "")
    return _cache[w]

def phonemize_ko(text):
    # phonemize each word (어절) separately so word breaks survive; espeak otherwise glues words together
    out = []
    for m in re.finditer(r"([^,.;:!?]+)([,.;:!?]*)", text):
        clause, punct = m.group(1).strip(), m.group(2)
        if not clause: continue
        words = [ph_word(w) for w in clause.split()]
        out.append(" ".join(w for w in words if w) + ("," if "," in punct or ";" in punct or ":" in punct else "." if punct else ""))
    return " ".join(out)

def ids_for(ph):
    ids = [TOK["^"], TOK["_"]]
    for ch in ph:
        if ch == " ": ids += [TOK["#"], TOK["_"]]; continue
        if ch in TOK and ch not in "^$": ids += [TOK[ch], TOK["_"]]
    ids.append(TOK["$"])
    return ids

def synth_one(text, length_scale):
    ph = phonemize_ko(text)
    ids = ids_for(ph)
    x = np.array([ids], np.int64)
    out = sess.run(None, {"input": x, "input_lengths": np.array([len(ids)], np.int64), "scales": np.array([0.4, length_scale, 0.5], np.float32)})
    a = np.asarray(out[0]).ravel()
    return a / max(1e-6, np.abs(a).max()) * 0.85

def synth_ko(text, length_scale=1.1):
    # one sentence (or clause chunk) at a time: the small model slurs when the input gets long
    parts = [t.strip() for t in re.split(r"(?<=[.!?])\s+", text) if t.strip()]
    chunks = []
    for part in parts:
        if len(part) > 40:  # split long sentences at commas too
            sub = [t.strip() for t in re.split(r"(?<=,)\s+", part) if t.strip()]
        else:
            sub = [part]
        for i, c in enumerate(sub):
            chunks.append(synth_one(c, length_scale))
            chunks.append(np.zeros(int(SR * (0.18 if c.endswith(",") else 0.38)), np.float32))
    return np.concatenate(chunks) if chunks else np.zeros(0, np.float32)

def save_mp3(audio, path, sr=SR, pad=0.15):
    a = np.concatenate([np.zeros(int(sr*0.05)), audio, np.zeros(int(sr*pad))])
    a = np.clip(a / max(1e-6, np.abs(a).max()) * 0.9, -1, 1)
    wav = path + ".wav"
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((a * 32767).astype("<i2").tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "48k", "-ar", "24000", path], check=True)
    os.remove(wav)
    return len(a) / sr

if __name__ == "__main__":
    t = sys.argv[1]; o = sys.argv[2]
    print(phonemize_ko(t))
    print("sec", round(save_mp3(synth_ko(t), o), 2))
