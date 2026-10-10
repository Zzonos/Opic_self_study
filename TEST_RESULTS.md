# ChatGPT 이동 방식 검증 결과

검증일: 2026-10-10 (한국시간). 기준 main: `4ab48cdf003872942152616f4fa046c3b5295b77`. 브랜치: `feat/gpt-study-integration`.

최종 구현은 사용자 요청에 따라 API 서버 방식을 **API 키 없는 ChatGPT 요청/결과 전달 방식으로 교체**했습니다. 이전 서버 테스트 결과는 이 최종 구현의 검증 결과로 계산하지 않습니다.

## 통과한 모의 검증

- 결과 계약 단위 테스트 12개: 9개 작업(evaluate/script/sample/mock/analysis/chat/hint/summary/translate), 요청 ID·종류·버전, 코드 블록, 잘못된 JSON과 사용 한도 메시지, 레벨·점수·순서·개수, 40문장 번역, prototype 필드, 원래 학습 프롬프트와 반환 계약.
- Chrome/Playwright 브라우저 시나리오 13개: 별도 Claude/ChatGPT 링크와 비로그인 전달; 평가 요청에 프로필·기준·답변 포함 및 기존 저장/동기화; 잘못된 ID·종류·한도 메시지의 기록 보존; 취소/연결 해제; 페이지 재접속 후 가져오기와 중복 방지; 클립보드 거부 시 직접 복사; 스크립트·리스닝 예문; 40문장 완료 뒤 후속 취소; ChatGPT 안에서 대화·힌트·해석·요약하는 요청과 결과 저장; 15문항 모의시험·분석; 로그아웃; 전용 GPT URL 검사; 기존 Claude 옵션·저장 경로 유지.
- 브라우저 시나리오마다 OpenAI/Firebase Functions AI 요청이 없는지 확인했습니다. Firebase 로그인·Firestore 저장은 가짜 SDK이며, ChatGPT 목적지는 가짜 페이지, AI 결과는 계약에 맞춘 모의 데이터입니다.
- 기존 질문은행·시나리오·평가 기준을 실제 소스에서 내보내고 Pages로 빌드합니다. 앱 JS 구문과 git diff --check를 검사합니다.

로컬 실행: Node.js 24.19.0, Playwright 1.62.1, 설치된 Chrome. 재현: `npm ci`, `npm test`, `npx playwright install chromium`, `npm run test:browser`. 이미 설치된 Chrome을 쓰려면 BROWSER_EXECUTABLE 환경 변수에 실행 파일 경로를 지정합니다.

## 실제 서비스 확인 — 미실행

실제 ChatGPT 계정에 로그인해 프롬프트를 수행시키거나 전용 GPT를 생성·게시하지 않았습니다. 따라서 실제 AI의 반환 형식 준수율·등급 품질·계정 한도는 미검증입니다. 실제 Claude capability와 Firebase 로그인/Firestore 동기화도 모의 대체했습니다. API 호출과 서버 배포는 최종 구조에서 사용하지 않습니다.

운영 반영 전에 실제 웹 요청 → ChatGPT 학습 → 결과 코드 블록 가져오기 → 다른 기기 기록 확인과 기존 Claude 기록 이전을 확인하세요. 오류가 나면 요청 ID를 유지한 채 지정된 JSON 형식으로 다시 출력하도록 ChatGPT에 요청합니다. 자세한 흐름은 GPT_SETUP.md에 있습니다.
