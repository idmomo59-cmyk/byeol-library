# 별의 서재 v6 — Gemini 무료 티어 우선

기존 v5.3 디자인, 만세력 베타 날짜 간지표, 대시보드, 타로 UI를 유지하며 **정통 사주 화면의 AI 상세 풀이 API**만 OpenAI에서 Gemini로 교체했습니다. 다른 메뉴의 시연용 운세를 실제 AI 생성으로 바꾸지는 않았습니다.

## Render 배포

1. GitHub `idmomo59-cmyk/byeol-library` 저장소의 기존 파일 중 `index.html`, `server.js`, `package.json`, `render.yaml`, `test.js`, `README.md`를 이 패키지의 파일로 교체/커밋합니다. 기존 웹 주소는 유지됩니다.
2. [Google AI Studio](https://aistudio.google.com/app/apikey)에서 **본인 프로젝트의 무료 티어와 모델 접근 권한**을 확인합니다. 모델 가용성은 계정에 따라 다릅니다. `gemini-2.5-flash-lite` 및 `gemini-2.5-flash`는 새 계정에서 사용 제한될 수 있습니다.
3. Render 서비스 → Environment → Add Environment Variable: `GEMINI_API_KEY` = 발급한 키. **GitHub, 코드, 이 채팅에 키를 입력하지 않습니다.**
4. 무료 티어임을 직접 확인하고, 결제 연결이 없는 프로젝트임을 확인한 경우에만 `GEMINI_FREE_TIER_CONFIRMED` = `true`로 설정합니다. 이 값이 없거나 `false`이면 AI 호출은 비활성화됩니다. 이는 안전 게이트일 뿐 Google 결제 상태를 기술적으로 보증하지 않습니다.
5. Render 재배포 후 `/api/health`의 `apiConfigured:true`, `freeTierConfirmed:true`를 확인합니다. 실제 AI 요청은 정통 사주 → AI 해석 버튼에서 테스트합니다.
6. `GEMINI_FREE_TIER_CONFIRMED`는 Render Environment에서 직접 설정하며, `render.yaml`에 기본값을 넣지 않았습니다. 비밀키는 절대 YAML에 넣지 마세요.

## 무료 정책

- 기본 모델 `gemini-2.5-flash-lite`, 보조 `gemini-2.5-flash` **두 개만** 허용. 실패 사유에 따라 보조 모델로 전환할 수 있으나 유료 모델 탐색/자동 전환은 하지 않습니다.
- 무료 티어 자체를 API 호출만으로 보증할 수 없습니다. Google AI Studio의 프로젝트 티어와 결제 설정을 반드시 확인해야 합니다. 특히 새 프로젝트에서는 Gemini 2.5 모델 사용이 제한될 수 있습니다.
- 기본 제한: 사용자 IP당 1시간 2회, 하루 3회, 전체 하루 30회. 중복 요청 캐시 1시간, 동일 요청 동시 호출 합치기, 타임아웃 22초, 429 지수 백오프 최대 2회.
- 사용량 기록은 **프로세스 메모리에서만** 유지되어 서버 재시작/슬립 시 초기화됩니다. 여러 서버 인스턴스 간 공유되지 않습니다. 프로덕션 공개 서비스에는 Redis/KV, CAPTCHA, 세션·로그인 기반 제한, 일일 예산 관리가 추가로 필요합니다.
- 무료 티어에서 입력 데이터가 제품 개선에 사용될 수 있으므로 이용자에게 고지하고 개인정보 최소화를 권장합니다. 서버에는 생년월일 원문을 로그로 남기지 않습니다. 요청 캐시 키는 SHA-256 해시입니다.
- 정밀 절기·진태양시 검증 전의 사주 간지표이므로 결과를 전문 감정으로 표시하지 않습니다.

## 로컬 테스트

`npm test` — 모의 Gemini REST 서버를 통한 검증. 실제 인증이나 무료 티어 가용성은 검증하지 않습니다.

`npm start` — 서버 실행 (Node 20 이상).

## 모델 접근이 안 될 때

Google AI Studio에서 무료로 사용 가능한 모델을 확인한 뒤 코드의 허용 목록을 검토해야 합니다. **임의의 유료 모델로 전환하지 않습니다.**
