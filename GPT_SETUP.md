# GPT 학습 기능 설정

GPT는 ChatGPT 사이트를 여는 방식이 아니라 OSS 앱 → Firebase HTTPS Function → OpenAI Responses API로 동작합니다. 기존 Claude 아티팩트의 `sample`, `db`, `user` 경로는 유지됩니다. GPT는 기존 Firebase 이메일 로그인과 `users/{uid}` 기록 저장·동기화를 사용합니다.

## 관리자 설정 및 배포

이 변경은 서버 배포나 키 등록을 자동 실행하지 않습니다. Firebase 프로젝트 `opic-self-study`의 관리자 계정으로 아래 작업을 진행하세요. Node.js 22와 Python 3이 필요합니다.

1. Firebase 콘솔에서 프로젝트의 결제(Blaze), Authentication 이메일/비밀번호, 기존 Firestore 데이터베이스를 확인합니다. 승인된 로그인 도메인에 `zzonos.github.io`와 로컬 확인용 `localhost`를 등록합니다. 기존 초대 계정과 학습 문서를 유지하세요.
2. 저장소의 작업 브랜치를 체크아웃하고 서버 의존성과 CLI를 설치합니다.

   ```sh
   git switch feat/gpt-study-integration
   npm install -g firebase-tools
   firebase login
   cd functions
   npm ci
   npm test
   cd ..
   ```

3. OpenAI API 프로젝트에서 API 사용 권한·결제와 예산 알림을 설정하고 프로젝트 전용 API 키를 발급합니다. 키는 다음 명령이 표시하는 비밀 입력에만 붙여넣습니다. 키를 HTML, GitHub, 커밋, 브라우저 설정이나 일반 `.env`에 넣지 마세요.

   ```sh
   firebase functions:secrets:set OPENAI_API_KEY --project opic-self-study
   ```

4. 배포 전 콘솔의 기존 Firestore 규칙과 `firestore.rules`가 일치하는지 확인합니다. `users/{uid}`의 기존 초대 가입·소유자 권한을 유지하고, `gptUsage/{uid}`는 클라이언트 읽기·쓰기를 모두 금지합니다. 기존 규칙이 다르면 기존 권한을 보존한 채 이 차단 규칙만 반영하세요. Admin SDK는 이 규칙을 우회하여 호출량을 관리합니다.

   ```sh
   firebase deploy --only firestore:rules --project opic-self-study
   firebase deploy --only functions:gptStudy --project opic-self-study
   ```

   Function은 `asia-northeast3`에 배포됩니다. Cloud Run 호출 자체는 공개이며, 함수 내부에서 **모든 AI 요청의 Firebase ID 토큰(폐기 여부 포함)**과 초대 가입으로 생성된 `users/{uid}` 문서 존재를 검사합니다. 조직 정책이 공개 Cloud Run 호출을 금지하면 관리자가 정책을 조정해야 합니다. API 키와 모델 설정은 서버에서만 읽습니다.

5. 기본 모델은 `gpt-4.1-mini`입니다. 변경하려면 비밀이 아닌 서버 파라미터 `OPENAI_MODEL`을 `functions/.env.opic-self-study`에 설정하고 함수를 다시 배포합니다. 예: `OPENAI_MODEL=gpt-4.1-mini`. 이 파일은 Git에서 제외됩니다. 모델은 Responses API 및 `max_output_tokens`를 지원해야 합니다.
6. 실제 배포 URL이 `https://asia-northeast3-opic-self-study.cloudfunctions.net/gptStudy`인지 확인합니다. 다른 프로젝트/지역을 사용하면 `src/artifact.html`의 `GPT_ENDPOINT`와 `functions/index.js`의 지역·허용 Origin을 함께 수정한 후 `python tools/build.py`로 다시 빌드합니다. 허용 Origin은 현재 GitHub Pages와 로컬 8765 포트뿐입니다.
7. GitHub Pages가 `main /docs`를 게시한다면 이 PR은 검토·병합 후에만 운영 웹앱에 반영됩니다. 이 작업에서 main에 푸시하거나 PR을 병합하지 않습니다. 브랜치 상태에서 먼저 확인하려면 다음 명령으로 로컬 페이지를 열고 기존 OSS 계정으로 로그인합니다.

   ```sh
   python tools/build.py
   python -m http.server -d docs 8765
   ```

   [로컬 OSS](http://localhost:8765)에서 **GPT로 실행**을 선택한 뒤 학습 기능을 실행합니다. 선택 자체에는 API 비용이 없고, 평가·생성·대화 등 요청부터 비용이 발생합니다. 서버를 설정하지 않은 상태에서 버튼만으로 GPT가 작동하지는 않습니다.

## 비용·제한·취소

- 사용자별 분당 12회, UTC 하루 150회(한국시간 오전 9시 초기화), 동시 2회. `gptUsage/{uid}`에서 Firestore 트랜잭션으로 예약하므로 인스턴스가 여러 개여도 공유됩니다. 제한 변경은 `functions/core.js`의 `reserveUsage` 기본값을 수정 후 서버 재배포합니다.
- 입력은 최대 60KB/30 메시지, 출력은 최대 8,000 토큰. 모의시험·스크립트가 너무 길어 출력이 잘리면 저장하지 않고 오류를 표시합니다. 긴 입력은 나누어 주세요.
- 최대 인스턴스 5개, 서버 OpenAI 요청 90초, 클라이언트 100초 제한. 사용자 한도는 전체 프로젝트의 지출 상한을 보장하지 않으므로 OpenAI와 Google Cloud 예산·알림을 별도로 설정하세요.
- 실패·취소 요청도 사용량에 포함합니다. 이미 처리된 토큰에는 비용이 발생할 수 있습니다. 브라우저 취소 시 서버는 연결 종료를 감지하면 OpenAI 요청을 중단하지만, 네트워크 프록시가 종료를 늦게 전달할 수 있어 비용 중단을 보장하지 않습니다.
- 응답은 OpenAI에 `store:false`로 요청하고 학습 결과만 기존 OSS 저장 경로로 보냅니다. 이는 OpenAI의 모든 보존 정책을 해제한다는 의미가 아닙니다. 키·토큰·답변 원문을 서버 로그에 출력하지 않습니다.

## 사용 흐름 및 오류

- 웹의 **GPT로 실행**과 **Claude에서 열기**는 별도 버튼입니다. Claude 버튼은 기존 아티팩트를 열고 기록 코드를 복사합니다. Claude 내부는 기존 capability를 사용합니다.
- GPT에는 OSS 로그인이 필요합니다. 로그인 상태에서 선택한 GPT 제공자는 해당 브라우저에 기억됩니다. API 키는 사용자에게 요구하지 않습니다.
- 401이면 로그인 토큰을 한 번 강제 갱신하며, 다시 실패하면 재로그인을 안내합니다. 자동으로 생성 요청을 재시도하지 않습니다.
- 처리 중 상단에서 **취소** 또는 **GPT 연결 해제**를 선택할 수 있습니다. 평가·스크립트의 기존 중지 버튼도 동작합니다. 로그아웃은 진행 중 요청을 취소합니다.
- 연결 오류·한도·취소 시 실패한 평가를 학습 기록에 추가하지 않습니다. 연습 입력, 대화의 미전송 입력, 기존 스크립트·기록은 유지합니다. 듣기 예시/번역을 여러 묶음으로 처리하다 실패하면 이미 완료해 저장한 묶음은 보존합니다. 모의시험 답변과 요약 전 대화는 현재 페이지 메모리에 남아 재시도할 수 있습니다. 페이지 새로고침 후 미완료 시험·대화 복구는 기존 앱과 마찬가지로 지원하지 않습니다.

## 실제 배포 후 확인

별도 시험용 초대 계정을 사용해 평가 → 새로고침/다른 기기에서 기록 확인, 스크립트·듣기 예시·번역, 대화·힌트·요약, 15문항 모의시험, 5건 이상 기록의 학습 분석을 확인하세요. Claude 아티팩트에서도 평가·기록 코드 이전을 확인하세요. 로그아웃/토큰 폐기, 한도 초과, 네트워크 차단, 처리 중 취소/연결 해제 후 기록 보존을 확인합니다.

실제 테스트는 OpenAI 비용과 Firebase 쓰기가 발생합니다. 현재 작업에서 실행한 모의 검증 범위는 [TEST_RESULTS.md](TEST_RESULTS.md)에 구분되어 있습니다.

공식 문서: [OpenAI 서버 API 시작](https://developers.openai.com/api/docs/quickstart), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Firebase Secret 설정](https://firebase.google.com/docs/functions/config-env), [Firebase ID 토큰 검증](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
