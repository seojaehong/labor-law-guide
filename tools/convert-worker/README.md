# 변환 워커 (convert-worker)

LibreOffice 로 사무 파일을 바꾸는 작은 서버다. SafeClaw(Vercel)는 LibreOffice 를 돌릴 수 없어서 변환만 이 워커에 맡긴다.

- 고객이 올린 옛 엑셀(.xls, BIFF8)을 .xlsx 로 바꿔 읽고, 돌려줄 때 다시 .xls 로 만든다. KOSHA 공개 위험성평가 예시는 전부 .xls 다.
- 엑셀·워드·파워포인트·(옛) 한글 파일의 PDF 미리보기를 만든다.

**한 이미지를 두 방식으로 돌린다.** 코드는 고치지 않는다.

| 방식 | 실행 | 용도 |
|---|---|---|
| Lambda 컨테이너 | 기본(ENTRYPOINT 가 `aws-lambda-ric` 실행) | 서울 리전, 쓴 만큼 과금 |
| HTTP 서버 | `MODE=http` 환경변수 | Lightsail·아무 Docker 호스트·로컬 |

SafeClaw 가 아는 것은 두 값뿐이다: `OFFICE_CONVERT_URL`, `OFFICE_CONVERT_TOKEN`. 호스트를 옮길 때는 이 둘만 바꾼다.

## API

```
POST {OFFICE_CONVERT_URL}/convert?to=xlsx|xls|pdf
Authorization: Bearer {OFFICE_CONVERT_TOKEN}
x-filename: 원래파일명.xls        ← 확장자만 쓴다. 한글이면 encodeURIComponent 로 보낸다
본문: 파일 바이트 그대로

GET {OFFICE_CONVERT_URL}/health  → {"ok":true}  (인증 없음)
```

성공하면 변환된 바이트와 `content-type` 을 돌려준다. 실패하면 JSON `{ok:false, code, message}` 이다.

| code | HTTP | 뜻 |
|---|---|---|
| UNAUTHORIZED | 401 | 토큰 없음·틀림 |
| MISCONFIGURED | 503 | 워커에 `CONVERT_TOKEN` 이 없음(요청 전부 거절), soffice 를 못 띄움 |
| UNSUPPORTED_FORMAT | 415 | 허용 안 된 입력 확장자 또는 출력 형식 |
| EMPTY_INPUT | 400 | 본문이 비었음 |
| INPUT_TOO_LARGE | 413 | 입력 상한 초과 |
| BUSY | 429 | 한 건 변환 중이고 대기열이 찼음 — 잠시 뒤 다시 |
| CONVERT_FAILED | 422 | LibreOffice 가 산출물을 못 냄(깨진 파일, 지원 안 되는 한글 판 등) |
| OUTPUT_TOO_LARGE | 502 | 산출물이 상한 초과(Lambda 6MB 응답 한도) |
| TIMEOUT | 504 | 시간 초과 — soffice 프로세스 트리를 죽였다 |

### 허용 형식

| 입력 | 출력 |
|---|---|
| xls · xlsx · xlsm · ods | xlsx · xls · pdf |
| doc · docx · ppt · pptx | pdf |
| hwp | pdf (아래 주의) |

- **hwpx 는 받지 않는다.** LibreOffice 에 hwpx 가져오기 필터가 없다.
- **hwp 는 사실상 안 된다고 보고 쓴다.** LibreOffice 의 HWP 필터는 옛 판 형식만 읽는다. 261123 실측 — 저장소 픽스처 `tests/fixtures/laws/sample-rules.hwp`·`table-rules.hwp`(요즘 한글 파일)를 컨테이너에 넣으면 둘 다 CONVERT_FAILED 였다. 한글 미리보기는 별도 경로(rhwp 등)가 필요하다. 행렬에는 남겨 두었다(옛 파일이 오면 열리고, 아니면 422 로 깔끔히 끝난다).

## POST /jobs — 서명 URL 방식

파일 바이트를 요청·응답 본문에 싣지 않는다. 호출하는 쪽(SafeClaw)이 저장소(S3·Supabase Storage 등)에 서명 URL 을 만들어 넘기면, 워커가 입력을 직접 내려받고 결과를 직접 올린다. Vercel 4.5MB·Lambda 6MB 본문 한도를 피하려는 경로다. 기존 `/convert` 는 그대로 둔다.

```
POST {OFFICE_CONVERT_URL}/jobs
Authorization: Bearer {OFFICE_CONVERT_TOKEN}     ← /convert 와 같은 토큰
content-type: application/json
{"op": "xlsx.fill", "inputUrl": "https://…서명 GET URL", "outputUrl": "https://…서명 PUT URL", "args": {…}}
```

1. 두 URL 을 먼저 검사한다(네트워크에 닿기 전). 2. `inputUrl` 을 GET 한다. 3. op 를 실행한다. 4. 결과 파일을 `outputUrl` 로 PUT 한다. 5. JSON 을 돌려준다.

| op | inputUrl | outputUrl | args | 처리 |
|---|---|---|---|---|
| `convert` | 필요 | 필요 | `{from, to}` — from = 입력 확장자, to = xlsx·xls·pdf (위 허용 형식 표) | LibreOffice |
| `xlsx.inspect` | 필요 | — | — | k-labor/office |
| `xlsx.extract` | 필요 | — | `{sheet?, headerRow?, maxRows?}` | k-labor/office |
| `xlsx.fill` | 필요 | 필요 | `{cells?, rows?, strict?}` | k-labor/office |
| `xlsx.make` | — | 필요 | `{spec}` | k-labor/office |
| `pptx.meeting` | — | 필요 | `{snapshot, kind?, fontFace?, layout?}` — 위험성평가 회의 덱 | k-labor/office |
| `pptx.extract` | 필요 | — | — | k-labor/office |

성공 응답(200):

```json
{"ok": true, "op": "xlsx.fill", "data": {…}, "warnings": [{"code": "…", "message": "…"}],
 "input":  {"sha256": "…", "bytes": 12345},
 "output": {"sha256": "…", "bytes": 23456, "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
 "meta":   {"op": "xlsx.fill", "engine": {"name": "k-labor/office", "version": "…", "commit": "…", "dirty": false}}}
```

`input` 은 입력을 받은 op 에만, `output` 은 파일을 올린 op 에만 있다. 받는 쪽은 `output.sha256` 으로 저장소에 올라간 파일을 대조한다.

실패 응답은 `{ok:false, code, message, details?, warnings?}` 이다. office op 의 실패 코드(INVALID_ARGS·UNSUPPORTED_INPUT·OVERFLOW·PRESERVATION_LOSS·WORKLOAD_TOO_LARGE·ZIP_TOO_LARGE·WRITE_FAILED·OUTPUT_TOO_LARGE)는 라이브러리 Result 그대로 422 로 낸다. **실패하면 PUT 하지 않는다.** `/convert` 표의 코드에 다음이 더해진다.

| code | HTTP | 뜻 |
|---|---|---|
| BAD_REQUEST | 400 | JSON 아님·모르는 op·args 가 객체 아님·필요한 URL 없음 |
| HOST_NOT_ALLOWED | 403 | URL 호스트가 `ALLOWED_STORAGE_HOSTS` 밖, https 아님, URL 에 사용자·비밀번호 |
| FETCH_FAILED | 502 | 입력 GET 이 200 이 아님(404·리다이렉트 포함) 또는 연결 실패 |
| UPLOAD_FAILED | 502 | 결과 PUT 이 2xx 가 아님 또는 연결 실패 |
| INPUT_TOO_LARGE | 413 | 입력 파일이 `JOB_MAX_INPUT_BYTES` 초과(선언 크기·실제로 읽은 크기 둘 다 본다) 또는 요청 JSON 이 `JOB_MAX_REQUEST_BYTES` 초과 |
| RESULT_TOO_LARGE | 422 | 응답 JSON 이 `JOB_MAX_RESULT_BYTES` 초과(이때도 PUT 하지 않는다) |
| TIMEOUT | 504 | 내려받기·처리·올리기 중 시간 초과. office op 는 작업 스레드를 끝낸다 |
| MISCONFIGURED | 503 | `ALLOWED_STORAGE_HOSTS` 가 비었음(모든 작업 거절) 또는 k-labor/office 묶음이 없음 |

### /jobs 가 지키는 것

- **SSRF 차단** — `ALLOWED_STORAGE_HOSTS`(쉼표 구분, `호스트[:포트]`)에 있는 호스트만 접근한다. https 만 쓴다. 리다이렉트는 따라가지 않는다(302 → FETCH_FAILED). DB 키·저장소 키는 워커에 없다 — 서명 URL 이 권한의 전부다.
- http 는 시험용이다. `STORAGE_ALLOW_HTTP=1` 이고 호스트가 loopback(localhost·127.0.0.1·[::1])일 때만 연다.
- office op 는 `worker_threads` 작업 스레드(`office-thread.mjs`)에서 돈다. 시간이 넘으면 스레드를 끝내고, 힙은 `JOB_MAX_OLD_GEN_MB` 로 묶는다. 라이브러리 한도(zip 풀린 크기·항목 수·칸 수·결과 크기)는 환경변수에서 주입한다.
- 로그에는 op·입출력 바이트·상태·코드·시간만 남긴다. URL(서명 토큰)·파일명·내용은 남기지 않는다.
- k-labor/office 묶음 위치 = `K_LABOR_OFFICE_MODULE` → 워커 폴더의 `office/index.mjs` → 저장소의 `tools/k-labor/dist/office/index.mjs`(먼저 `node tools/k-labor/build.mjs`). Docker 이미지에는 지금 들어가지 않는다(빌드 컨텍스트 밖이라 Dockerfile 이 직접 가져오지 못한다) — 없으면 office op 는 503 MISCONFIGURED, `convert` op 는 그대로 돈다. 넣으려면 빌드 전에 묶음을 `tools/convert-worker/office/` 로 복사하고 Dockerfile 에 `COPY office ./office` 줄을 더하거나, 묶음을 마운트하고 `K_LABOR_OFFICE_MODULE` 을 준다(둘 다 미실측).

## 환경변수

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `CONVERT_TOKEN` | (없음) | **필수.** 없으면 HTTP 서버는 뜨지 않고, Lambda 는 모든 요청을 503 으로 거절 |
| `MODE` | (없음) | `http` 이면 HTTP 서버, 아니면 Lambda 런타임 |
| `PORT` | 8080 | HTTP 모드 포트 |
| `SOFFICE_PATH` | 이미지 `/usr/bin/soffice`, 윈도우 `C:/Program Files/LibreOffice/program/soffice.exe` | LibreOffice 실행 파일 |
| `CONVERT_MAX_INPUT_BYTES` | 20971520 (20MB) | 입력 상한. Lambda 에서는 4,400,000 으로 더 줄어든다 |
| `CONVERT_MAX_OUTPUT_BYTES` | 0 (제한 없음) | 출력 상한. Lambda 에서는 4,400,000 |
| `LAMBDA_MAX_PAYLOAD_BYTES` | 4400000 | Lambda 모드의 입력·출력 상한 |
| `CONVERT_TIMEOUT_MS` | 60000 | 변환 1건 시간 상한 |
| `CONVERT_MAX_QUEUE` | 4 | 진행 중 1건 외에 기다릴 수 있는 요청 수. 넘으면 429. Lambda 에서는 0 |
| `CONVERT_WORK_DIR` | OS 임시 폴더(`/tmp`) | 요청별 임시 폴더를 만들 곳 |
| `CONVERT_QUIET` | (없음) | `1` 이면 요청 로그를 끈다 |
| `ALLOWED_STORAGE_HOSTS` | (없음) | /jobs 가 접근할 저장소 호스트(쉼표 구분, `호스트[:포트]`). **비면 /jobs 는 전부 503** |
| `STORAGE_ALLOW_HTTP` | (없음) | `1` 이면 loopback 호스트에 한해 http 허용(시험용) |
| `JOB_MAX_REQUEST_BYTES` | 2097152 (2MB) | /jobs 요청 JSON 상한 |
| `JOB_MAX_INPUT_BYTES` | 52428800 (50MB) | 내려받을 입력 파일 상한 |
| `JOB_MAX_OUTPUT_BYTES` | 52428800 (50MB) | 올릴 결과 파일 상한 |
| `JOB_MAX_UNZIPPED_BYTES` · `JOB_MAX_ZIP_ENTRIES` · `JOB_MAX_CELLS` | 200MB · 10000 · 2000000 | office op 한도(라이브러리 Limits) |
| `JOB_MAX_RESULT_BYTES` | 4194304 (4MB) | 응답 JSON 상한. Lambda 에서는 `LAMBDA_MAX_PAYLOAD_BYTES` 이하로 줄어든다 |
| `JOB_TIMEOUT_MS` | 120000 | 작업 1건 전체(내려받기·처리·올리기) 시간 상한 |
| `JOB_FETCH_TIMEOUT_MS` | 30000 | GET·PUT 한 번의 시간 상한 |
| `JOB_MAX_OLD_GEN_MB` | 1024 | office 작업 스레드 힙 상한. 0 = 제한 없음 |
| `K_LABOR_OFFICE_MODULE` | (없음) | k-labor/office 묶음(index.mjs) 경로 |

### 지키는 것

- 요청 하나마다 새 임시 폴더와 새 LibreOffice 프로필(`-env:UserInstallation=file:///…`)을 만들고 끝나면 지운다. 파일을 남기지 않는다.
- 디스크에는 `input.<확장자>` 로만 쓴다. 원래 파일명은 디스크에도 로그에도 남기지 않는다.
- 로그 한 줄 = 시각·확장자·출력 형식·입력/출력 바이트·HTTP 상태·오류 코드·걸린 시간. 내용은 남기지 않는다.
- 토큰은 해시끼리 상수시간으로 비교한다.
- HTTP 모드는 인증 → `content-length` 순서로 거른 뒤에야 본문을 읽고, 읽는 중에도 상한을 넘으면 멈춘다.
- 성공 판정은 종료코드가 아니라 **산출물 파일이 실제로 있는지**로 한다(soffice 는 입력을 못 읽어도 0 으로 끝나는 일이 있다).
- 시간이 넘으면 띄운 soffice 의 프로세스 트리만 죽인다(리눅스 = 프로세스 그룹, 윈도우 = `taskkill /PID <pid> /T /F`).

## 로컬에서 돌리기 (윈도우)

LibreOffice 가 `C:/Program Files/LibreOffice` 에 있어야 한다.

```bash
cd tools/convert-worker
CONVERT_TOKEN=아무값 node server.mjs            # http://localhost:8080
curl -s -X POST "http://localhost:8080/convert?to=xlsx" \
  -H "Authorization: Bearer 아무값" -H "x-filename: a.xls" \
  --data-binary @a.xls -o a.xlsx
```

시험:

```bash
node --test "tools/convert-worker/test/*.test.mjs"
# SOFFICE_PATH · KOSHA_XLS_DIR(표본 폴더) · KOSHA_SAMPLE_LIMIT(기본 4) 로 바꿀 수 있다
```

시험은 저장소 루트의 `exceljs`·`xlsx` 를 쓴다. KOSHA 표본은 경로로만 읽고 저장소에 복사하지 않는다. soffice 나 표본이 없으면 변환 시험은 건너뛴다(건너뛴 수가 출력에 나온다).

## HTTP 컨테이너로 돌리기

```bash
docker build --platform linux/amd64 --provenance=false -t k-labor-convert-worker tools/convert-worker
docker run --rm -p 8080:8080 -e MODE=http -e CONVERT_TOKEN=긴임의값 k-labor-convert-worker
```

Lightsail 컨테이너 서비스나 다른 Docker 호스트도 같다. `MODE=http`, `CONVERT_TOKEN` 두 값만 넣고 8080 을 연다. 앞에 HTTPS(로드밸런서·리버스 프록시)를 둔다 — 토큰이 평문으로 지나가면 안 된다.

Lambda 처럼 읽기 전용 파일 시스템에서 도는지 미리 보려면:

```bash
docker run --rm -p 8080:8080 -e MODE=http -e CONVERT_TOKEN=x \
  --read-only --tmpfs /tmp --user 1000 k-labor-convert-worker
```

(윈도우 Git Bash 에서는 `/tmp` 가 윈도우 경로로 바뀌어 실패한다 — 앞에 `MSYS_NO_PATHCONV=1` 을 붙인다.)

### 261123 실측 (Docker Desktop, 이 PC — 배포는 하지 않았다)

- 이미지 약 1.03GB(Debian trixie, LibreOffice 25.2.3, 나눔 글꼴, tini).
- 기본 모드를 Lambda 밖에서 띄우면 안내를 찍고 코드 64 로 끝난다.
- `MODE=http --read-only --tmpfs /tmp --user 12345:12345`(Lambda 흉내 — 읽기 전용, 이미지에 없는 uid)로 KOSHA 표본 **12건 전부** .xls → xlsx → xls 왕복과 .xls → pdf 가 성공했다. 시트 수, 시트별 병합(고유 범위) 수가 원본과 같았고 그림(xl/media)·인쇄 영역·가로 방향이 살아 있었다. PDF 에는 NanumGothic 이 임베드됐다. 건당 4~28초(파일 0.5~4MB).
- **Lambda 모드도 컨테이너 안에서 돌려 봤다.** 가짜 Runtime API(로컬 Node)를 `AWS_LAMBDA_RUNTIME_API` 로 물려 `aws-lambda-ric` 4.0.2 가 이벤트 3건(/health 200, .xls → xlsx 200·base64, 틀린 토큰 401)을 처리했다. 실제 AWS 위에서는 아직 돌려 보지 않았다.
- `CONVERT_TIMEOUT_MS=300` → 504 TIMEOUT. tini 를 넣기 전에는 죽인 `soffice.bin` 이 node(PID 1) 밑에서 좀비로 남았다 — 그래서 ENTRYPOINT 가 tini 다.

### 알려진 충실도 차이

- KOSHA 90703 의 한 시트는 원본에 **같은 병합 범위가 두 번** 적혀 있다(17개, 고유 16개). LibreOffice 는 하나로 합쳐 16개로 낸다. 잃은 병합은 없다.
- 왕복 xls 크기가 원본과 다르다(예: 526KB → 304KB, 1.4MB → 2.1MB). 시트·병합·그림 수는 같았지만 셀 서식 하나하나를 대조하지는 않았다.

## Lambda 컨테이너로 배포 (ap-northeast-2) — 절차만

> 이 저장소 작업에서는 배포하지 않았다. 아래는 사람이 할 순서다.

1. ECR 리포지토리 만들기: 서울 리전 `k-labor-convert-worker`.
2. 이미지 빌드 — **반드시 `--provenance=false`**. buildx 가 붙이는 증명 매니페스트가 있으면 Lambda 가 이미지를 거절한다.
   ```bash
   docker build --platform linux/amd64 --provenance=false -t k-labor-convert-worker tools/convert-worker
   ```
3. ECR 로그인 → 태그 → 푸시.
4. Lambda 함수 만들기: 「컨테이너 이미지」, 아키텍처 x86_64, 위 이미지 URI.
   - 메모리 **2048MB 이상**(LibreOffice 는 메모리가 적으면 느리고 CPU 도 메모리에 비례해 붙는다)
   - 제한 시간 **90초 이상**(`CONVERT_TIMEOUT_MS` 60초 + 콜드 스타트 여유)
   - 임시 스토리지(`/tmp`) 기본 512MB 로 충분, 큰 파일이 많으면 1024MB
   - 환경변수: `CONVERT_TOKEN`(긴 임의값). `MODE` 는 넣지 않는다
   - 예약 동시성: 5 정도로 묶어 두면 비용 폭주를 막는다
5. 함수 URL 만들기: 인증 유형 `NONE`(토큰은 워커가 직접 검사), 호출 모드 `BUFFERED`.
6. SafeClaw(Vercel) 환경변수: `OFFICE_CONVERT_URL` = 함수 URL(끝 `/` 없이), `OFFICE_CONVERT_TOKEN` = 4 의 값.
7. `curl {URL}/health` → `{"ok":true}` 확인 후 .xls 한 건 변환.

### Lambda 에서만 걸리는 한도

- ★ **HTTP 모드 입력 상한은 20MB 지만 Lambda 에서는 입력·출력 각각 약 4.4MB 다.** KOSHA 표본 중 가장 큰 것이 약 4.1MB 라 한도 바로 아래다.
- **요청·응답이 각각 6MB 다.** 바이너리는 base64(4/3 배)로 실리므로 **원본 기준 약 4.4MB** 가 실제 상한이다. 입력이 넘으면 INPUT_TOO_LARGE(또는 AWS 가 먼저 413), 출력이 넘으면 OUTPUT_TOO_LARGE 다. 그보다 큰 파일이 필요하면 HTTP 모드 호스트로 옮기거나, S3 사전 서명 URL 로 주고받도록 바꾼다(지금은 하지 않았다).
- 인스턴스 하나가 한 번에 한 요청만 받으므로 워커 안 대기열은 0 이다. 동시 요청은 Lambda 가 인스턴스를 늘려 처리한다.

### 콜드 스타트

이미지가 크고(LibreOffice) 요청마다 새 프로필을 만들어서, 처음 요청은 수 초~10초대가 걸린다. 같은 인스턴스의 다음 요청도 프로필 초기화 비용은 다시 낸다(격리를 위해 일부러 그렇게 했다). SafeClaw 쪽 호출 제한 시간은 넉넉히(90초) 둔다. 체감이 문제가 되면 빌드 때 만든 프로필 틀을 요청마다 복사하는 방식으로 줄일 수 있다.

참고 — 윈도우 PC 실측: KOSHA .xls 한 건을 xlsx 로 바꾸고 다시 xls 로 돌리는 데 약 30초(변환 2회, 매번 새 프로필).

## 호스트 옮기기

워커 코드도 이미지도 그대로다. 새 곳에서 이미지를 띄우고(`MODE=http` 또는 Lambda), SafeClaw 의 `OFFICE_CONVERT_URL`·`OFFICE_CONVERT_TOKEN` 두 값만 바꾼다. 경로(`/convert`, `/health`)와 응답 형식은 두 방식이 같다.

## 비용

Lambda 는 쓴 만큼만 낸다(요청 수 × 실행 시간 × 메모리). 월 수백 건 규모면 무료 한도 안이거나 몇 달러 수준이다. 그래도 **AWS Budgets 에 월 $5 경보를 걸어 둔다.** ECR 저장 용량(이미지 약 1GB 미만)도 소액 과금된다. 오래된 이미지 태그는 수명 주기 규칙으로 지운다.
