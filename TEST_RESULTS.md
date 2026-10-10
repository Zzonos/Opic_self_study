# GPT 통합 검증 결과

검증일: 2026-10-10 (한국시간). 기준 main: `4ab48cdf003872942152616f4fa046c3b5295b77`. 작업 브랜치: `feat/gpt-study-integration`.

## 모의 테스트 — 통과

- 서버 Node 테스트 **15개**: 평가, 스크립트, 듣기 예시, 모의시험, 분석, 대화, 힌트, 요약, 번역의 JSON 계약; 입력·메시지·번역 개수 제한; 응답 개수/레벨/점수 검증; 사용자별 분/일/동시 호출 한도 및 lease 만료 복구; 토큰 실패·폐기·초대 미가입 거부; Origin/메서드/사전 요청; OpenAI 거부·잘림·잘못된 JSON·429/500·연결 종료; 실패 시 lease 해제 및 비밀 오류 메시지 차단. 번역 40문장 응답도 검증.
- Chrome/Playwright 브라우저 모의 시나리오 **16개**: 별도 GPT/Claude 버튼·로그인 필요, 평가 결과 localStorage와 기존 `cloudPush` 동기화에 저장, 429/로그인 만료/네트워크 실패/취소의 입력·기록 보존, 401 토큰 갱신 1회, 스크립트·예시·번역·분석, 대화·힌트·요약 저장, 대화 실패 시 미전송 문장 복원, 모의시험 15문항 저장과 재렌더 중 중복 호출 방지, 로그아웃 취소, 처리 중 연결 해제, Firebase 토큰 요청 중 취소, 번역 후속 묶음 실패 시 앞선 40문장 저장 보존, Claude 원래 옵션 전달과 기록 저장.
- `python tools/build.py`로 Pages 생성 파일 갱신. 앱 JavaScript 및 서버 JavaScript 구문 검사, `git diff --check` 통과.
- 설치된 Firebase Admin/Functions SDK로 함수 등록 확인. 서버 의존성 `npm audit`: 알려진 취약점 0개.
- 로컬 검증 Node.js 24.19.0, 배포 대상 Node.js 22. 테스트 브라우저는 설치된 Chrome을 Playwright 1.62.1로 실행.

브라우저 테스트는 실제 앱 HTML과 UI 이벤트를 실행합니다. Firebase SDK 로그인·Firestore 저장·Claude capability·GPT 서버 응답은 모두 가짜로 대체합니다. 서버 테스트의 토큰 검증·멤버 확인·사용량 저장도 의존성 주입으로 대체합니다. 실제 Firebase 트랜잭션/규칙 에뮬레이터 검증을 실행했다는 의미는 아닙니다.

## 실제 API / 서비스 테스트 — 미실행

OpenAI API 키와 Firebase 관리자 배포 인증이 제공되지 않아 **실제 OpenAI 호출, 서버 배포, 실제 Firebase 로그인·Firestore 동기화, 실제 Claude 아티팩트 capability, 실제 청구 비용/응답 품질은 검증하지 않았습니다**. 모바일 마이크·음성 재생은 기존 기능으로, 실기기 테스트는 실행하지 않았습니다.

운영 반영 전 [GPT_SETUP.md](GPT_SETUP.md)의 설정·배포 및 실제 계정 검증을 진행해야 합니다. 이 변경은 기존 서버나 main의 운영 페이지를 자동 배포하지 않습니다.

## 재현

```sh
python tools/build.py
npm ci
npm test
npx playwright install chromium
npm run test:browser
cd functions
npm ci
npm test
npm audit
```

브라우저가 이미 설치돼 있으면 `BROWSER_EXECUTABLE` 환경 변수에 Chrome/Chromium 실행 파일 경로를 지정할 수 있습니다. Windows PowerShell 예:

```powershell
$env:BROWSER_EXECUTABLE = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run test:browser
```
