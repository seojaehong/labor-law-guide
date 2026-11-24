# 변환 작업자 배포 — 장기 키 없이(OIDC 역할)

배포는 GitHub Actions `convert-worker-deploy`(수동 실행)가 한다. 이 PC·서버에 AWS 키를 두지 않는다.
역할 권한은 이 저장소 한 곳·ECR 저장소 하나·Lambda 함수 하나로 묶었다(`deploy-policy.json`). IAMFullAccess 를 쓰지 않는다.

## 콘솔에서 한 번만 (서울 리전 ap-northeast-2)

1. **예산 알람 먼저** — Billing → Budgets → 예산 생성 → 월 비용 예산 $5, 실제·예측 80%/100% 이메일 알림.
2. **OIDC 공급자** — IAM → 자격 증명 공급자 → 추가 → OpenID Connect
   - 공급자 URL `https://token.actions.githubusercontent.com`, 대상 `sts.amazonaws.com`
3. **배포 역할** — IAM → 역할 → 역할 만들기 → 「사용자 지정 신뢰 정책」에 `trust-policy.json` 붙여 넣기
   → 권한은 「정책 생성」 JSON 에 `deploy-policy.json` 붙여 넣기 → 역할 이름 **`convert-worker-deploy`**
   - 신뢰 정책은 `seojaehong/labor-law-guide` 저장소의 GitHub 환경 `convert-worker-prod` 에서만 역할을 쓰게 한다.
4. **ECR 저장소** — ECR → 저장소 생성 → 비공개, 이름 **`k-labor-convert-worker`**. 수명 주기 규칙: 최근 이미지 5개만 유지.
5. **Lambda 실행 역할** — IAM → 역할 → AWS 서비스 Lambda → 정책 `AWSLambdaBasicExecutionRole` 만 → 이름 `convert-worker-exec`.
6. **GitHub 환경** — 저장소 Settings → Environments → `convert-worker-prod` 생성(필요하면 「Required reviewers」에 본인).

## 첫 배포(함수가 아직 없을 때)

Lambda 함수는 이미지가 있어야 만들 수 있다. 첫 회만 순서가 다르다.

1. Actions → `convert-worker-deploy` 실행 → 이미지 push 는 성공하고 마지막 단계(Update Lambda)는 「함수 없음」으로 실패한다(정상).
2. 콘솔 Lambda → 함수 생성 → 컨테이너 이미지 → ECR 에서 방금 이미지 선택, x86_64, 실행 역할 `convert-worker-exec`
   - 메모리 2048MB, 제한 시간 90초, 예약 동시성 5, 환경변수 `CONVERT_TOKEN`(긴 임의값 — 채팅에 붙이지 말 것), 이름 **`k-labor-convert-worker`**
3. 구성 → 함수 URL 생성: 인증 NONE(토큰은 작업자가 검사), 호출 모드 BUFFERED.
4. 이후 배포는 Actions 버튼 하나.

## 연결

SafeClaw(Vercel) 환경변수: `OFFICE_CONVERT_URL` = 함수 URL(끝 `/` 없이) · `OFFICE_CONVERT_TOKEN` = 2 의 값 · `RISK_FILES_BUCKET=ra-files` · `SAFECLAW_RISK_LEDGER_ENABLED`(켤 때). 확인 = `curl {URL}/health` → `{"ok":true}`.
