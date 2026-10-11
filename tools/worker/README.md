# OSS 음성 중계 서버 (Cloudflare Worker)

웹 앱이 스크립트 문장을 보내면 Microsoft Edge 읽어주기 음성(edge-tts와 동일 서비스)으로 mp3를 만들어 돌려주는 작은 서버.
웹 앱은 이 서버로 녹음한 mp3를 사용자 계정(Firestore users/<uid>/clips)에 저장해 무한재생에 사용한다.

## 배포 (한 번)
1. https://dash.cloudflare.com 가입/로그인 (무료)
2. Workers & Pages → Create → Create Worker → 이름 예: `oss-tts` → Deploy
3. Edit code → 기본 코드를 지우고 `tts-worker.js` 전체를 붙여넣기 → Deploy
4. 주소 `https://oss-tts.<계정>.workers.dev` 를 OSS 웹 앱 설정 → "음성 서버"에 붙여넣고 저장 → 연결 테스트

## 주의
- 비공식 서비스(Edge 브라우저용)라 Microsoft 쪽 변경으로 멈출 수 있음. 그 경우 앱은 기기 음성으로 자동 복귀.
- `ALLOW_ORIGINS`에 적힌 사이트에서만 호출 가능. 다른 도메인에서 쓰려면 추가.
