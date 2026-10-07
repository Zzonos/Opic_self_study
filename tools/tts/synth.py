import json, re, subprocess, sys, os, wave, struct
import numpy as np, onnxruntime as rt
KK = "/tmp/claude-0/-home-claude/5f4cd580-33e9-5483-b159-456aab58962c/scratchpad/kk"
ESP = f"{KK}/esp/bin/espeak-ng"; ESPD = f"{KK}/esp/share/espeak-ng-data"
VOCAB = json.load(open(f"{KK}/kokoro-onnx/src/kokoro_onnx/config.json"))["vocab"]
SR = 24000
sess = rt.InferenceSession(f"{KK}/kokoro-v1.0.onnx", providers=["CPUExecutionProvider"])
voices = np.load(f"{KK}/voices-v1.0.bin")
TOK = "input_ids" if any(i.name == "input_ids" for i in sess.get_inputs()) else "tokens"

def phonemize(text):
    # keep punctuation: phonemize clause by clause and re-attach marks
    out = []
    for m in re.finditer(r"([^,.;:!?]+)([,.;:!?]*)", text):
        clause, punct = m.group(1).strip(), m.group(2)
        if clause:
            r = subprocess.run([ESP, f"--path={ESPD}", "-q", "--ipa", "-v", "en-us", clause], capture_output=True, text=True)
            ph = " ".join(r.stdout.split())
            ph = ph.replace("͡", "").replace("ʲ", "").replace("(en)", "").replace("(fr)", "")
            out.append(ph + punct.replace(";", ".").replace(":", ","))
    ph = " ".join(out)
    return "".join(c for c in ph if c in VOCAB).strip()

def synth(text, voice="am_michael", speed=1.0):
    ph = phonemize(text)
    toks = [VOCAB[c] for c in ph]
    if not toks: return np.zeros(0, np.float32)
    # chunk at 500 tokens on sentence boundaries if needed
    chunks, cur = [], []
    for t, c in zip(toks, ph):
        cur.append(t)
        if len(cur) > 400 and c in ".!?": chunks.append(cur); cur = []
    if cur: chunks.append(cur)
    audio = []
    for ch in chunks:
        style = voices[voice][min(len(ch), 510) - 1]
        out = sess.run(None, {TOK: np.array([[0, *ch, 0]], np.int64), "style": style.astype(np.float32), "speed": np.array([speed], np.float32)})
        audio.append(np.asarray(out[0]).ravel())
    return np.concatenate(audio)

def save_mp3(audio, path, pad=0.15):
    a = np.concatenate([np.zeros(int(SR*0.05)), audio, np.zeros(int(SR*pad))])
    a = np.clip(a, -1, 1)
    wav = path + ".wav"
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((a * 32767).astype("<i2").tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "48k", "-ar", "24000", path], check=True)
    os.remove(wav)
    return len(a) / SR

if __name__ == "__main__":
    text = sys.argv[1]; out = sys.argv[2]; voice = sys.argv[3] if len(sys.argv) > 3 else "am_michael"
    print(phonemize(text))
    d = save_mp3(synth(text, voice), out)
    print("sec", round(d, 2), os.path.getsize(out))
