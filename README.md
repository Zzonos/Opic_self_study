# OSS — Opic Self Study (하루 30분 오픽 IM3 학습 앱)

개인 학습용 웹앱. 컴퓨터·휴대폰 브라우저에서 바로 실행되며, 웹에서는 OSS 로그인 후 **GPT로 실행**, Claude 아티팩트에서는 기존 Claude 연결로 AI 기능(평가·스크립트·대화·해석)을 사용합니다. GPT 서버 배포·키 설정은 [GPT_SETUP.md](GPT_SETUP.md)를 따르세요.

## 기능
- **오늘** — 30분 루틴(표현카드 10장 → 스크립트 1개 → 질문 3개/AI 대화), 연속 학습일, 레벨 추이(IM3 목표선)
- **연습** — 서베이 주제 14 + 돌발 11 + 롤플레이 6세트 + 고난도, 80여 문항. 타이머 → 말하기(키보드 받아쓰기) → AI 평가: 레벨/점수, 고칠 표현, IM3·IH 모범답안
- **대화** — 스픽 방식 AI 회화. 인터뷰어/자유대화/롤플레이 5종, 턴마다 교정 카드, "뭐라고 말하지?" 힌트, 텍스트/말하기 모드, 종료 시 레벨·표현 정리
- **모의시험** — 실제 구성 15문항(자기소개 1·콤보 9·롤플레이 3·고난도 2), 실전 듣기 모드(질문 음성만, 2회 재생), 종합 채점
- **스크립트** — 프로필 기반 주제별 110–150단어 스크립트 생성·저장, 쉐도잉
- **듣기** — 무한 재생(질문/모범답안/표현카드/내 자료, 한국어 해석, 반복 횟수, 생각할 시간), 잠금화면 컨트롤·백그라운드 재생, 질문 듣기 훈련, 쉐도잉, TED-Ed 등 스크립트 붙여넣기
- **표현카드** — 플립카드 42장 + AI 피드백에서 추가한 내 표현
- **설정** — 프로필(직업·거주·디테일), 서베이 주제 선택, 음성 선택(녹음 남/여, 기기 음성)

## 구조
```
src/artifact.html   # 앱 본문 (Claude 아티팩트에 게시하는 원본, <title>+<style>+<script> 단일 파일)
docs/index.html     # GitHub Pages용 (tools/build.py가 src에서 생성)
docs/audio/         # 미리 렌더링한 음성 클립 (영어 남/여, 한국어 해석, 무음)
tools/build.py      # src → docs 빌드
functions/          # Firebase 로그인 검증·사용량 제한·OpenAI 서버 호출
GPT_SETUP.md        # GPT 서버 배포·API 키·모델 설정
TEST_RESULTS.md     # 모의 검증과 실제 API 미검증 범위
tools/tts/          # 음성 클립 생성 스크립트 (Kokoro / Mimic3, 오프라인)
```

## 실행
- **Claude 아티팩트 (AI 기능 포함)**: `src/artifact.html` 본문과 `docs/audio/*`를 아티팩트로 게시. 런타임 capability `sample`, `db`, `user` 필요.
- **GitHub Pages**: Settings → Pages → Branch `main` / folder `/docs`. Firebase GPT 서버 설정 후 OSS 로그인 → **GPT로 실행**으로 웹에서 AI 기능을 사용합니다. 듣기·카드·질문 연습은 서버 연결 없이도 동작합니다. 로그인하면 기록을 기존 Firebase 계정으로 동기화합니다. iPhone에서는 Safari 공유 → "홈 화면에 추가".
- **로컬**: `python3 -m http.server -d docs 8765` → http://localhost:8765

## 제약과 설계 메모
- 아티팩트 환경은 마이크 접근과 외부 네트워크가 막혀 있어, 말하기는 **키보드 받아쓰기**로 입력하고 AI는 텍스트를 평가합니다.
- 기기 음성(speechSynthesis)은 iPhone에서 화면이 꺼지면 멈추므로, 질문·표현카드와 그 한국어 해석은 **녹음 파일**로 제공해 백그라운드 재생을 보장합니다. AI가 새로 만든 스크립트·모범답안은 기기 음성을 씁니다.
- 학습 기록: 아티팩트에서는 Claude 계정(db)에, 그 밖에서는 localStorage에 저장. 둘 다 있으면 최근 수정본 우선.

## 웹 버전 전용 기능 (GitHub Pages)
- 홈 화면 앱 아이콘, 새 배포 자동 감지 후 새로고침
- 서비스워커 오프라인 캐시 + 듣기 탭 "전체 음성 오프라인 저장"
- 브라우저 음성인식(Web Speech)으로 마이크 입력 — 연습·모의시험·대화 말하기 모드
- 설정 → 기록 코드 복사/가져오기로 웹 ↔ Claude 기록 합치기

## 계정 · 기기 간 동기화 (Firebase, 웹 버전)
- Firebase Authentication(이메일/비밀번호) + Cloud Firestore `users/{uid}` 문서 1개에 전체 상태(JSON) 저장
- 가입 시 초대 코드 필요 — 코드는 `firestore.rules`의 `inviteOk()`에만 있고 앱 코드에는 없음
- 로그인하면 클라우드 기록을 내려받아 병합 → 저장할 때마다 1.5초 디바운스 업로드 → 다른 기기 변경은 onSnapshot으로 자동 병합
- Firebase 콘솔 설정: Authentication → 이메일/비밀번호 사용, Firestore 생성(프로덕션), 규칙에 `firestore.rules` 붙여넣기, Authentication → 설정 → 승인된 도메인에 `zzonos.github.io` 추가
- Claude 아티팩트 안에서는 외부 네트워크가 막혀 Firebase를 쓰지 않음(Claude 계정 db 사용). 웹 ↔ Claude는 설정의 "기록 코드"로 옮김

## 로드맵
- [x] 서버에 API 키를 보관하는 GPT 연결 (웹에서도 AI 평가·대화)
- [ ] 생성된 스크립트도 녹음 클립으로 변환하는 파이프라인
- [ ] 서비스워커(오프라인 캐시)
