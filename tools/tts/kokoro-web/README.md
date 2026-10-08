# 브라우저 내장 Kokoro TTS (실험 보류)

- `kokoro.js`: Kokoro-82M int8 ONNX를 onnxruntime-web으로 돌리는 엔진 + 순수 JS G2P(misaki 사전 + CMUdict).
- `tts-lab.html`: 테스트 페이지.
- 모델/사전/음성 파일은 저장소에서 제거함. 다시 만들려면: thewh1teagle/kokoro-onnx 릴리스의 `kokoro-v1.0.int8.onnx`를 14MB 단위로 분할(`model/kokoro.int8.partN`), `voices-v1.0.bin`에서 음성을 float32 raw로 추출(`voices/*.bin`), hexgrad/misaki의 `us_gold.json`+`us_silver.json`+CMUdict로 `lex.json` 생성, `manifest.json`에 parts/size/vocab/voices 기록.
- 실측(2026-10): iPhone Safari에서 8초 오디오 생성에 41초(0.2x) → 실시간 대화용 불가. PC는 브라우저 음성(Edge Natural)으로 충분해 도입 보류.
