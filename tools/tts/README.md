# 음성 클립 생성 (오프라인 TTS)

앱의 `docs/audio/` 아래 mp3는 이 스크립트로 미리 렌더링한 것입니다.

| 폴더 | 음성 | 엔진 |
|---|---|---|
| `audio/m` | 남성 (en-US Andrew Multilingual Neural) | edge-tts (`edge_render.py`) — 현재 사용 |
| `audio/f` | 여성 (en-US Ava Multilingual Neural) | edge-tts — 현재 사용 |
| `audio/ko` | 한국어 해석 (ko-KR SunHi Neural) | edge-tts — 현재 사용 |
| (예전) | Kokoro-82M / Mimic3 ko_KO | `synth.py`, `synth_ko.py` — 오프라인 대안 |
| `audio/silence_*.mp3` | 무음 | ffmpeg |

## 준비물
- Python 3.10+ / `numpy`, `onnxruntime`
- `espeak-ng` (발음 변환) — 소스 빌드 또는 패키지 설치
- `ffmpeg`
- 모델 파일 (`tools/tts/models/`에 두기, git에는 포함하지 않음)
  - https://github.com/thewh1teagle/kokoro-onnx/releases → `kokoro-v1.0.onnx`, `voices-v1.0.bin`
  - https://github.com/thewh1teagle/kokoro-onnx (저장소의 `src/kokoro_onnx/config.json` = 토큰 vocab)
  - https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models → `vits-mimic3-ko_KO-kss_low.tar.bz2`

## 실행
스크립트 상단의 경로 상수를 환경에 맞게 바꾼 뒤:
```
python3 gen.py am_michael m      # 영어 남성
python3 gen.py af_heart f        # 영어 여성
python3 gen_ko.py                # 한국어 해석
```
`items.json` / `items_ko.json`은 `src/artifact.html`의 질문·카드 데이터에서 추출합니다 (키: `q_<topic>_<n>`, `rp_<id>_<11|12|13>`, `adv_<n>`, `c<n>`).
