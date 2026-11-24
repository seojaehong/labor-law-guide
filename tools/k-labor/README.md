# k-labor — 노동 업무 도구 (Korea Labor Tools)

4대보험 신고서·근로계약서·노동 계산기·취업규칙 점검을 [일의 무늬](https://yellowenvelope.kr)가 만든 그대로 **내 PC 의 AI(Claude Code·Claude Desktop 등)** 에서 쓰도록 한 패키지로 묶은 로컬 MCP 서버입니다.
도구는 **묶음(group)** 단위로 들어 있고, 필요한 묶음만 켤 수 있습니다. 묶음은 앞으로 늘어납니다.

npm [`k-labor`](https://www.npmjs.com/package/k-labor) · 공식 MCP 레지스트리 이름 `io.github.seojaehong/k-labor` · 도구 안내 https://yellowenvelope.kr/ai-tools

---

## 🚀 설치 (내 PC)

Node.js 20 이상만 있으면 됩니다.

### Claude Code

```bash
claude mcp add --scope user k-labor -- npx -y k-labor mcp
```

일부 묶음만 켜려면 `--groups` 를 붙입니다.

```bash
claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups nhis
```

### 셸·스크립트에서 도구 하나 부르기 (`call`)

MCP 연결 없이 도구 하나를 바로 부릅니다. 인자는 JSON 파일로 넘기고(한글 경로·역슬래시가 셸 따옴표에 깨지지 않게), 결과는 표준출력에 나옵니다. 도구가 멈추면(`ok: false`·입력 오류·없는 도구) 종료 코드 1, 인자 파일을 못 읽으면 2입니다. MCP 와 같은 도구 등록·입력 검사를 거칩니다.

```bash
echo '{"unit":"hour","amount":10500}' > args.json
npx -y k-labor call check_min_wage args.json --groups calc
```

### Claude Desktop

`claude_desktop_config.json` 에 추가합니다.

```json
{
  "mcpServers": {
    "k-labor": {
      "command": "npx",
      "args": ["-y", "k-labor", "mcp"],
      "env": {
        "POPBILL_LINK_ID": "내 링크아이디",
        "POPBILL_SECRET_KEY": "내 비밀키",
        "POPBILL_CORP_NUM": "내 사업자번호",
        "POPBILL_FAX_SENDER": "내 팩스 발신번호"
      }
    }
  }
}
```

<details>
<summary>🪟 Windows 에서 Claude Desktop 이 npx 를 못 찾을 때</summary>

`cmd /c` 로 감쌉니다.

```json
{
  "mcpServers": {
    "k-labor": { "command": "cmd", "args": ["/c", "npx", "-y", "k-labor", "mcp"] }
  }
}
```
</details>

<details>
<summary>🧩 Cursor · Windsurf · 그 밖의 MCP 호스트</summary>

같은 `command` / `args` 를 각 도구의 MCP 설정에 넣습니다. stdio 전송이면 전부 됩니다.
</details>

붙이고 나서 AI 에게 이렇게 말해 보세요.

> 「충북 청주시 상당구 상당로 155 사업장의 건강보험 관할 지사 팩스 번호 찾아줘.」
> 「people.json 명단으로 건강보험 자격상실 신고서 PDF 만들어 줘.」

---

## 🧰 도구

| 묶음 | 도구 | 하는 일 |
|---|---|---|
| `nhis` | `find_branch` | 주소나 사업자등록번호로 건강보험 관할 지사와 자격(취득·상실) 담당 전화·팩스를 찾습니다 |
| `nhis` | `make_form` | 자격상실(별지 8호)·자격취득(별지 6호) 신고서 + 지연 사유 사업주확인서를 PDF 한 파일로 만듭니다. 명단은 `peopleFile`(JSON 파일 경로)로만 받습니다 |
| `popbill` | `popbill_status` | 내 팝빌 계정의 연결·잔액·팩스/문자 권한·등록된 발신번호 조회(보내지 않음) |
| `popbill` | `send_fax` / `fax_result` | 내 계정·내 번호로 팩스 전송(`confirm:true` 일 때만) · 결과 조회 |
| `popbill` | `send_sms` / `sms_result` | 내 계정·내 번호로 문자 전송(`confirm:true` 일 때만) · 결과 조회 |
| `contract` | `design_contract_wage` | 근로계약서 임금 구성 설계 — 월 총액(또는 실수령액)·파트 시급과 근무형태로 항목별 시간·금액·통상시급, 점검 규칙으로 다시 본 결과, 입력 오류 |
| `contract` | `check_contract` | 근로계약서 점검 — 사이트 점검·오프라인판과 같은 입력(계약 JSON)으로 항목별 위반·리스크·적정·자료 필요와 수정 방향 |
| `contract` | `make_contract_files` | 근로계약서 엑셀(xlsx)·한글(hwpx)·PDF 를 폴더에 저장 **(로컬 전용)** |
| `calc` | `check_min_wage` | 최저임금 비교(시간급 환산, 올해·내년 고시) |
| `calc` | `calc_weekly_holiday_pay` | 주휴수당 |
| `calc` | `count_regular_workers` | 상시 근로자 수 — 5명 이상으로 보는 기간, 10명 이상 기간, 1년 이상 근속자 연차 적용 |
| `calc` | `calc_take_home_pay` | 실수령액(4대보험 근로자 몫·간이세액표 소득세·지방소득세) |
| `calc` | `calc_notice_pay` | 해고예고수당 |
| `calc` | `calc_leave_pay` | 연차수당(남은 일수 또는 퇴직 시 발생 누계, 단시간 근로자) |
| `calc` | `calc_severance` | 퇴직금(퇴직일 전 3개월 평균임금 + 상여·연차수당 3/12, 통상임금이 높으면 통상임금) |
| `calc` | `calc_holiday_pay` | 노동절·관공서 공휴일에 일한 날의 임금 — 월급제·일용직·시급제, 5명 이상·4명 이하 |
| `calc` | `calc_pay_proration` | 급여 일할계산 — 중간 입사·퇴사한 달의 방식별 값(30일·달력 일수·소정근로일·시간·전액), 결근·지각 공제 |
| `calc` | `calc_shutdown_allowance` | 휴업수당(평균임금 70% 본문과 통상임금 단서를 나란히, 휴업 중 받은 임금 반영) |
| `calc` | `check_ordinary_wage` | 통상임금 점검 — 항목마다 정해진 주기·지급 대상·근무시간의 대가와 붙은 조건으로 들어가는지, 2024. 12. 19. 전후 기준을 나란히 |
| `calc` | `calc_wage_delay_interest` | 늦게 준 임금·퇴직금의 지연이자(연 20%) — 퇴직 정산분은 마지막 근무일 + 14일, 재직 중 임금은 정기지급일부터 |
| `calc` | `check_contractor` | 3.3% 계약(도급·프리랜서)이 근로자에 가까운지 — 질문 8개의 답으로 요소별 정리 |
| `calc` | `check_monthly_pay` | 월급 대조 — 중도입사·중도퇴사·결근 공제·시급제 주휴가 있는 달의 월급을 다시 계산해 받은 금액과 나란히(이름·주민등록번호는 받지 않음) |
| `leave` | `calc_annual_leave` | 입사일 기준 연차 발생일수(1년 미만 월 1일·15일·2년마다 1일, 최대 25일) |
| `leave` | `settle_leave_on_exit` | 퇴직 때 연차 재정산 — 입사일 기준 누계와 회계연도 부여 누계 중 유리한 쪽에서 쓴 일수를 뺀 일수 |
| `leave` | `calc_attendance_rate` | 출근율 — 연차 발생 요건(1년 80% 이상)을 출근으로 보는 날·빼는 날을 나눠 계산 |
| `tax` | `calc_retirement_tax` | 퇴직소득세·지방소득세(국세청 퇴직소득 세액계산 프로그램과 같은 칸 순서, 2023. 1. 1. 이후 퇴사) |
| `tax` | `calc_midyear_settlement` | 중도퇴사자 연말정산 예상 — 보험료 소득공제 신청 여부 두 가지로 퇴직월 정산액 |
| `tax` | `calc_daily_worker_tax` | 일용근로소득 원천징수(일 15만 원 공제·6%·근로소득세액공제 55%·소액부징수) |
| `duties` | `list_employer_duties` | 상시 근로자 수에 맞는 사업주 의무·법정 의무교육·위반 시 제재, 다음 규모에서 더 생기는 의무 |
| `work-rules` | `list_law_revisions` | 기간 안에 시행되는 노동 관계 법령 개정·시행 예정 목록. 묶은 자료에 법제처 Open API 실시간 확인을 더합니다 |
| `work-rules` | `get_law_article` | 법령명·조문 번호로 그날 시행 중인 판의 조문 원문(법제처 Open API) |
| `work-rules` | `compare_law_versions` | 법령 하나의 두 시점 판을 조문 단위로 글자 비교 — 신설·개정·삭제와 개정 전·후 원문(법제처 Open API) |
| `work-rules` | `check_work_rules_revisions` | 취업규칙 본문(글자)과 최종 개정일로, 그 뒤 시행되는 개정이 반영됐는지 표준취업규칙 2026 조문에 짝지어 대조 |
| `work-rules` | `check_work_rules_file` | 같은 대조를 취업규칙 파일(hwp·hwpx·docx·pdf·txt)로 **(로컬 전용)** |
| `work-rules` | `make_work_rules_report_forms` | 취업규칙 신고·변경신고 서류(별지 제15호서식 신고서·신구 조문 대비표·의견청취서·동의서)를 PDF·한글로 저장 **(로컬 전용)** |
| `nosa` | `assess_labor_council` | 노사협의회 설치의무(상시 30명)·근로자위원 선출방식(위촉·직접·간접)·위원 수·선출 정족수(과반수 참여, 간접 1·2단계, 선거구별)·근로자대표 겸임 두 기준·회의 정족수·소집·신고·고충 기한·일정 역산. 숫자·날짜만 받습니다 |
| `nosa` | `check_council_meeting` | 노사협의회 회의 하나를 확인 — 소집 통보 기한(개최일 − 8일)·정기회의 3개월(3개월 기간마다 1회, 넘으면 알림)·개최 정족수(정원 기준 각 과반)·안건별 의결(출석 3분의 2, 올림)·법 제21조 미의결 시 임의 중재 안내·정기회의 보고사항 4개 누락·의결사항 공지 기한(규정 값). 숫자·날짜·선택지만 받습니다 |
| `nosa` | `make_labor_council_forms` | **로컬 전용(파일 쓰기).** 00 협의회규정 견본(매뉴얼 [부록 1]을 현행 법령에 맞춰 고친 것 — 칸은 입력값, 모르는 칸은 ○○, 과반수 노동조합·선거구·위원선거인·공동의장은 하나만 남기고 조 번호를 다시 매김)과 노사협의회 설치·선출·신고 서류 01~14(설치의무·선출방식 확인서, 선거관리규정, 선거인명부, 정족수 확인서, 당선공고, 근로자대표 겸임 선출 확인서, 소집통보서, 안건 구분표, 고충처리위원 선임 의결서, 고충처리 운영지침, 위촉통지서, 협의회규정 필수기재 점검표, 노동포털 SN012 제출 입력값)를 PDF·hwpx 로. 근로자 이름·서명 칸은 비워 둡니다. 덮어쓰지 않습니다 |
| `nosa` | `make_council_election_docs` | **로컬 전용(파일 쓰기).** 근로자위원 선거 서류 7종 — 선관위 구성 공고 · 선거공고문 · 입후보 신청서(주민등록번호 칸·추천서 없음) · 후보자 공고 · 투표용지(후보 수 ≤ 정원이면 찬반형) · 개표록(과반수 참여 확인, 선거구별·간접선거) · 당선공고(설치·신고 서류와 같은 틀). 날짜는 설치 목표일에서 거꾸로 잡은 일정이 기본값. 참여 미달이면 당선공고를 만들지 않고, 찬반투표 당선 기준은 정하지 않습니다(찬성·반대 수만). `docs` 로 고를 수 있고 덮어쓰지 않습니다 |
| `nosa` | `check_council_rules` | **로컬 전용(읽기만, 본문에 이름이 있을 수 있음).** 사업장 협의회규정 본문(글자)을 현행 근로자참여법·시행령과 협의회규정 견본에 조항별로 대조 — 항목마다 필수(법령 문언과 다르거나 법령이 요구하는 것이 빠짐)/권장(오기·빈 시행일·별지 서식 잔재)/선택(법령이 정하지 않아 노사가 정하고 매뉴얼 예시와 같은 방식: 입후보 추천 요건·「기타」 중재·고정 회의일), 규정 위치, 근거 조문, 지금 글, 고칠 방향. 근로자 과반수 참여(직접·간접 두 단계, 선거 공고의 당선 요건) · 결원 30일 이내 충원(위촉하거나 선출) · 차점자 조건 · 협의사항 17개 호 · 임의 중재 대상 · 고충처리위원 3명 이내·청취일 기산 · 정족수 · 정기회의 · 기재사항 7개 · 부칙 시행일 · 별지 서식. 결과의 `submission` 은 변경 제출 서류(시행규칙 별지 제1호서식 제출서 + 변경된 규정 + 신·구조문대비표, 시행규칙 제3조제1항, 2023. 6. 8. 개정) |
| `nosa` | `record_council_history` | **로컬 전용(파일 쓰기).** 기록 폴더에 한 줄 덧붙이기 — 의결 안건의 이행 기록(`_이행기록.jsonl`: 일자·상태·담당 직위·내용·근거·확인한 회의, 근거 없는 완료는 「완료(근거 없음)」) 또는 회의록 이력(`_회의록이력.jsonl`: 초안·회람·수정·서명 완료·공지·가져옴 확인, 파일을 주면 SHA-256). 또는 고충처리 대장(`_고충대장.jsonl`: 사건 번호 G-…·청취/통보/회의 부의/종결·분류 — 청취일부터 10일 통보 기한, 대장 1년 보존, 이름·사연은 받지 않음). 고치거나 지우지 않고 정정도 새 기록(`corrects`). 「가져옴 확인」은 그때의 원본 해시에 묶임 |
| `nosa` | `export_council_vault` | **로컬 전용(파일 쓰기).** 기록 폴더 → 옵시디언 보관함(노드 = md 파일, YAML 앞머리 + `[[위키링크]]`; 선은 안건 ID·결과·법조문 분류·제안 측·이행 기록에서만, 자유 글은 링크가 되지 않게) + `_대시보드.md`(미이행·기한 경과 의결, 3회 이상 이월, 1년간 다루지 않은 제20조제1항 호, 정기회의 간격, 보고사항 누락, 고충 통보 기한 경과) · 고충 노드(협의회 부의 선) + `_회의록대장.md·.xlsx`(서명·공지·보존 만료·해시 점검). 덮어쓰지 않고, 대소문자만 다른 안건 ID 는 막습니다. 같은 기록 폴더를 사이트 [노사협의회 회의록 그래프](https://yellowenvelope.kr/tools/council-graph)에서 열면 브라우저 안에서 그래프로 봅니다 |
| `nosa` | `import_council_minutes` | **로컬 전용(파일 쓰기).** 옛 회의록(hwp·hwpx·docx·pdf·txt·png·jpg)을 기록 폴더로 가져오기. ① 글자·SHA-256·기록 폴더의 회의 키와 안건 ID 를 돌려줌(쓰지 않음) → ② 모델이 원문에서 읽은 구조(회의·정원·안건 ID·제목·구분·법조문·제안 측·결과·이월)를 넣으면 도구가 확인(구분과 결과의 짝·ID·날짜·원문에 개최일과 제목이 있는지·원본 변경)하고 「가져옴 — 확인 전」 `.json` 을 씀. 원본은 옮기지 않고 경로·해시만, 확인(`record_council_history` 가져옴 확인) 전에는 잇지 않음, 제목만 비슷하면 「후보」. 글자층 없는 pdf 쪽·사진은 이 PC 안에서 문자 인식(tesseract.js 한국어, 네트워크 없음 — optionalDependencies)으로 읽고 `ocrPages` 로 알림 |
| `nosa` | `make_council_rules_comparison` | **로컬 전용(파일 쓰기).** 현행·개정 협의회규정(글 또는 hwp·hwpx·docx·pdf·txt 파일) → 신·구조문대비표. `check_council_rules` 와 같은 조·항·호 나누기로 표지·조·항·호·부칙·별지 서식을 글자 비슷한 것끼리 짝지음(번호가 밀린 호도 내용으로), 바뀐 곳만 「현 행 \| 개 정 안」 줄로, 바뀐 어절에 양쪽 밑줄, 안 바뀐 항·호는 「(생략)」/「(현행과 같음)」, 「<신 설>」/「<삭 제>」. 마크다운을 돌려주고 docx·hwpx(가로 A4, 쪽을 넘는 표)·xlsx(밑줄 없음)를 씀. 덮어쓰지 않음 |
| `forms` | `list_hr_forms` | 모성보호·일가정 양립 서식 7종(법정 서식 「출산전후휴가(배우자 출산전후휴가)ㆍ육아휴직 통합 신청서」(시행규칙 별지 제7호의2, 원본 칸에 그대로 채움) + 사내 서식 6종: 육아휴직·단기 육아휴직·배우자 출산전후휴가·난임치료휴가 신청서, 육아휴직 허용·단기 육아휴직 시기변경 통지서)의 칸(이름·종류·필수·선택지)과 근거 조문. 원격판에도 있음 |
| `forms` | `check_hr_form` | 파일을 만들지 않고 칸 검사 — problems(빈 필수 칸·날짜 형식·주민등록번호 모양) / notes(신청 기한 30일·7일 전, 기간 1년·추가 6개월, 출산예정일 50일 전·출산일부터 120일, 연 6일, 허용 통지 14일 같은 조문 대조 안내) / 원고. 이름이 실리므로 로컬 전용 |
| `forms` | `make_hr_form` | **로컬 전용(파일 쓰기).** 칸 검사 뒤 서식을 한글(hwpx)로. 주민등록번호 칸 없음(생년월일만). 덮어쓰지 않고, 호출끼리 상태가 없어 여러 건을 동시에 불러도 된다. 웹판 https://yellowenvelope.kr/tools/hr-forms |
| `docs` | `make_hwpx_from_markdown` | **로컬 전용(파일 쓰기).** 마크다운 원고 → 한글(hwpx). 제목 4단계(## 앞 □, Ⅰ~Ⅹ 장 앞 쪽나눔) · 본문 굵게 · 판례 번호 자동 굵게 · 목록 · 표(머리행 음영·반복, 열 폭 자동, 정렬, 칸 안 줄바꿈, 7열 이상 작은 글자, 긴 표는 쪽을 넘김, 칸은 어절 단위 줄 나눔·줄간격 150%) · 끝 15줄 안 날짜 줄부터 서명부 · 쪽번호. 프리셋 internal(행간 160%·여백 20mm)·tribunal(행간 200%·위 45·아래 30mm). `orientation: 'landscape'` = A4 가로(표 폭·배치도 가로 본문 폭, 양식 모드에서는 양식 쪽 설정 우선) · `tableLineSpacing` = 표 칸 줄간격 100~250%(기본 150). 제목 앞·뒤 간격(h1 16/6·h2 12/3·h3 8·h4 6pt, 문서 첫 제목·쪽 나눔 제목은 앞 간격 0), 본문·제목·표 칸 모두 어절 단위 줄 나눔. 양식 모드 `templateSamples.cell`·`cellHead` = 표 칸·머리행 칸 모양을 양식에서 이식(테두리·음영은 엔진 것). `features.table.align: 'left'` = 표 본문 칸 왼쪽 정렬(양식 칸이 양쪽 정렬이라 좁은 칸 글자가 벌어질 때, 양식 칸 문단을 복제해 정렬만 바꿈 · 가운데·오른쪽 칸과 머리행은 그대로 · 기본 = 종전). 병합 칸·밑줄·인용 블록·링크는 못 만들고 `leftovers` 로 알림. 덮어쓰지 않음 |
| `docs` | `read_hwp_as_markdown` | **로컬 전용(파일 쓰기).** 한글(HWP 5.x·hwpx) → 마크다운 파일. 병합 표는 colspan·rowspan HTML 표로 남김. `layout`: `visual`(기본, 읽기용) · `keep`(원본 표 구조 그대로 — `patch_hwp_from_markdown` 으로 되쓸 원고). 그림 추출·OCR 안 함. 일부만 읽음·손상 복구·빈 본문·배포용 안내문뿐이면 파일은 쓰고 `ok:false`·`incomplete:true`·`problems`. 본문은 응답에 싣지 않고 파일로만(응답은 주민번호 모양을 가림) |
| `docs` | `fill_hwp_form` | **로컬 전용(파일 쓰기).** 서식 라벨 옆 칸·괄호 빈칸을 `values`(라벨 → 값, 배열이면 등장 순서대로)로 채워 `.hwp`(HWP 5.x 저장 후 되읽어 값 대조) 또는 `.hwpx` 로. hwp 서식은 서식 그대로 hwpx 로 바꿔 채우고, 못 바꾸거나 일부만 읽었으면 멈춤. 띄어쓰기·괄호를 빼면 같아지는 라벨 둘은 멈춤(`collisions`). `requireUnique` 기본 **true**(두 곳 이상에 맞는 라벨은 누름틀 포함 채우지 않음). `unmatched`·`rejected`·`leftover`(칸보다 많은 배열 값)·`losses`(HWP 저장 손실)·되읽어 없는 값이 있으면 파일은 쓰고 `ok:false`·`incomplete:true`. `filled` 에 값을 쓴 자리(표·행·열 또는 누름틀 이름). 주민번호 모양 값은 받지 않음 |
| `docs` | `patch_hwp_from_markdown` | **로컬 전용(파일 쓰기).** `layout: keep` 으로 뽑은 md 를 고친 것을 원본에 되쓰기 — 바뀐 글자만, 서식 그대로, 원본과 같은 형식(hwp→.hwp, hwpx→.hwpx). `structure` 기본 **false**(원고에 없는 문단을 지우지 않음). 되쓰지 못한 편집·일부만 반영된 편집(`partial`)·행 끝 공백 두 칸 줄바꿈은 `skipped`(이유·가린 발췌, 앞 20건 + `skippedTotal`), 대조 잔차는 `verification` — 하나라도 있거나 대조를 못 했으면 파일은 쓰고 `ok:false`·`incomplete:true`. `changes` = 원본·결과를 다시 읽어 센 줄 차이(`removedLines`·`addedLines`, 틀 표 칸 안 변경도 셈). 원본에 없던 주민번호 모양·가림 표시가 원고에 생기면 멈춤. CRLF 원고 받음, UTF-8 또는 EUC-KR |
| `docs` | `check_prose` | 퇴고 — 원고의 비유·번역투·AI 문체 상투어·서식 위반을 줄·칸 단위로 찾는다(A 고칠 표현 / B 문맥 판단). `>` 인용 줄과 `[관련 판결]` 줄은 본문 규칙을 보지 않는다. 규칙·검출식·기준값은 팩(JSON)에 있다 — 범용 팩 `lib/prose/generic-pack.json`(im-not-ai lexicon v1.3 전 115항목 유래, MIT — 전부 B, 항목마다 장르를 켜고 끈다) + env `PROSE_PACK_DIR`(절대 경로)의 `*.json`. 팩에 `yield: true` 를 적으면(범용 팩) 같은 줄에서 다른 팩의 걸림 하나가 그 걸림을 감싸거나 같은 칸에서 시작하면 싣지도 세지도 않는다 — 같은 자리가 두 번 보이지 않게(일부만 겹치거나 다른 팩 걸림이 그 안에 있으면 둘 다 남긴다). 팩 정규식은 파이썬 re 문법으로 쓰고 컴파일할 때 같은 뜻의 JS 로 옮긴다 — 같은 뜻으로 옮길 수 없는 것(`\w`·`\b`·숫자 되참조·인라인 플래그·`i` 플래그·최소 길이가 0 인 식 등)은 받지 않는다. `(?P=이름)` 되참조는 늘 지나가는 이름 묶음(맨 바깥·0번 반복 없음·맨 바깥에 `|` 없음)일 때만 받는다. 제외어 창(후보 앞뒤 12글자)은 줄 안에서만 본다. 읽지 못했거나 점검 중 멈춘 팩, 없는 `PROSE_PACK_DIR` 폴더·팩이 하나도 없는 폴더는 `ok:false`·`incomplete:true`·`skipped`(고정 코드, 오류 글·팩 이름 없음). 공개 팩의 걸림은 걸린 글자·고칠 말·규칙 id 까지, 비공개 팩(`private: true`, 그리고 `PROSE_PACK_DIR` 팩 중 `private: false` 라고 적지 않은 것)은 줄·칸·길이·등급·짧은 사유·응답마다 바뀌는 참조값만(env `PROSE_ALLOW_FULL=1` 이면 전부). `detail`: 비움(위 기본) / brief(모든 팩 위치만) / full(허용 안 된 비공개 팩은 줄이고 `withheld`). brief 는 한 번의 응답에 규칙 원문이 보이지 않게 할 뿐, 여러 번 불러 규칙을 좁히는 것까지 막지는 못한다 — 비공개 팩은 원격판에 싣지 않는다. hits 는 500건(A 먼저, 같은 등급은 문서 앞부터 — 멈춘 팩의 걸림은 빼고 고른다) + `truncated`, counts 는 살아남은 팩의 전부. 팩 파일은 호출마다 바이트를 읽어 앞서 읽은 것과 같을 때만 앞의 컴파일 결과를 쓴다. `genre` legal(기본)·consulting·lecture·general(official = general — 단 규칙의 `skipGenres` 는 부른 이름 official 과 접은 장르를 둘 다 보므로 official 만 따로 끌 수 있다. 범용 팩의 법률 트랙 keep 5항목이 `skipGenres: [legal, official]`. 응답 `genre` 는 접은 장르, `requestedGenre` 는 부른 이름 — 다시 부를 때는 `requestedGenre`). 모델을 부르지 않는다 |
| `docs` | `check_norms` | 퇴고 공개 규범 — 한글 맞춤법(문화체육관광부 고시 제2017-12호) 제5장 띄어쓰기(제41~45항: 「및」·「수밖에」·「제-」·의존 명사 「수/것」·열거 뒤 「등」·만 단위)와 부록 「문장 부호」(쉼표·마침표·괄호·쌍점·따옴표 띄어쓰기, 줄임표, 일본식 모점 등), 연결어미 뒤 쉼표(~하였고, ~경우, — 규정이 아니라 업무 문서 관행. 「경고, 견책」처럼 「고」로 끝나는 명사는 뺀다)를 줄 단위로 찾는다. `checks` spacing·punct·comma(비우면 셋 다). 규정이 둘 다 허용하는 것(단위 명사·보조 용언·단음절 연속·고유 명사·절 사이 쉼표 등)은 보지 않는다. 보지 않는 줄은 검사마다 다르다 — 띄어쓰기: `#` 제목·`\|` 표·`---`·`[관련 …]`·`[질의 …]` 줄, `>` 인용 줄과 문장 안 “ ” 인용(`quote` 면 인용은 본다) / 문장 부호: 같은 줄들과 따옴표 안 글자(`quote` 면 모두 본다) / 쉼표: `>`·`#`·그림 줄과 “ ” ‘ ’ 「 」 " " 안(`quote` 와 상관없이 늘 뺀다, `\|` 표·`[관련 …]` 줄은 본다). `warnOnly` 면 쉼표 걸림을 B 로(PDF 추출본). 줄 나눔은 파이썬 `splitlines`(띄어쓰기·문장 부호)·줄바꿈 문자 하나(쉼표)와 같고, 숫자(`\d`)는 파이썬 3.13(Unicode 15.1) 범위로 본다. 검사마다 counts(전부) + hits 500건(A 먼저, 상한 밖은 세기만) + `truncated`. 걸림마다 줄·칸·길이·등급·걸린 글자·사유·근거 조항·앞뒤 글. 글 길이에 비례해 끝난다(긴 한 줄·긴 공백·닫히지 않는 따옴표도). 주민등록번호 모양이 있으면 점검하지 않고 `rrnLines`(줄 번호만). 규칙은 공개 규범이라 `lib/prose/norms.mjs` 코드에 있다. 모델을 부르지 않는다 |
| `docs` | `check_semantic` | 퇴고 의미범주 — 추상 개념을 사물·몸짓처럼 쓰는 비유 표현을 줄 단위로 찾는다. 식·낱말·태그·건너뛸 줄·가릴 구간·장르별 허용 낱말은 **비공개 팩(`PROSE_PACK_DIR`)의 `semantic` 절(format 2)에만** 있다 — 절이 없거나(팩 없음·읽지 못한 팩 있음) 규칙이 비었거나 모르는 칸을 쓰면 점검하지 않고 `ok:false`·`incomplete:true`·`code`. `genre` 는 아무 이름이나 받는다(기본 legal). 걸림은 줄·참조값만(`PROSE_ALLOW_FULL=1` 이면 태그·조각과 `pack`(팩 이름@절 판)까지, full 을 줄였으면 `withheld`), 500건까지 + `truncated`. 줄 나눔은 파이썬 파일 읽기(`\r\n`·`\r` → `\n`) + `splitlines` 와 같다. 주민등록번호 모양이 있으면 `rrnLines`. 모델을 부르지 않는다 |
| `docs` | `check_rhetoric` | 퇴고 AI 수사 — 생성형 모델 글에 잦은 수사 틀을 문장 단위로 찾는다(줄로 갈린 문장은 이어 보고 인용부호 안은 가린다). `track` legal·blog·consult·lecture(그 밖은 legal 로 보고 부른 이름은 `requestedTrack`), 등급(A 고칠 수사 / B 문맥 판단)은 트랙마다 다르다. 식·낱말·규칙 id·등급·고칠 방향·규칙마다의 판정 단계·결정표·가림 식은 **비공개 팩의 `rhetoric` 절(format 2)에만** 있다 — 공개 코드(`lib/prose/rhetoric.mjs`)는 줄 준비·문장 잇기·적중 조립의 틀과, 팩의 조건식을 푸는 작은 해석기만 갖고 칸은 뜻 없는 번호(`r01`…·`w01`…)로만 안다. 절이 없거나 깨졌으면 `check_semantic` 과 같이 불완전으로 실패. counts(전부) + hits 500건(A 먼저, 싣는 순서는 문서 순서) + `truncated`. 걸림은 줄·등급·참조값만(허용한 PC 에서는 조각·고칠 방향·묶음·규칙·`pack` 까지). 파이썬 `re` 뜻(\s·\d·\b·^$·빈 일치·코드포인트 길이·BMP 밖 글자)은 `lib/prose/pyre.mjs` 가 옮기고, 빈 글자에 맞을 수 있는 규칙 식은 받지 않는다. 모델을 부르지 않는다 |
| `docs` | `check_rewrite` | 퇴고 윤문 뒤 보존 대조 — 윤문 전 글(`before`)과 윤문한 글(`after`)을 견주어 바뀌면 안 되는 것이 바뀌었는지 줄 단위로 찾는다. **비교 단위**: 같은 문장은 닻(양쪽에 한 번씩만 나오는 문장의 최장 증가 부분열, 작업량 상한)으로 맞추고, 짧은 닻이 긴 구간을 통째 삭제·삽입으로 가르면 푼다. 바뀐 덩어리 안은 문장 짝 정렬(Needleman-Wunsch, 바이그램 Dice 0.35 이상)로 짝을 짓고, 다른 덩어리로 옮겨 간 문장은 같은 글 또는 유사도 0.5 이상으로 건너 짝짓는다. 수치·인용·용어는 짝 문장(+옆의 짝 없는 문장) 안에서만 견주고 글 전체 개수로 상쇄하지 않는다. 항목 일곱: **수치**(부호 + 값 + 만·억 + 단위 + 비교어(이상·이하·미만·초과·이내·이후·이전, 안에 = 이내)를 한 덩이로. 날짜(`2026. 3. 2.`·`2026.3.2`·`2026년 3월 2일` 같은 값)·조문(`제3조 제2항`·`제43조의2`)·시각·사건번호·요일·원문자는 한 키. NFKC 로 전각 숫자는 같은 값, 천 단위 쉼표·앞자리 0 은 표기, 만·억 환산은 하지 않는다. 짝 문장 안 차례가 바뀌면 자리 바뀜) · **인용**(“ ” 「 」 『 』 ‘ ’ 〈 〉 《 》 ｢ ｣, 줄 안에서 짝이 맞는 곧은 큰따옴표(홀수면 숫자 뒤 `"` 를 뺀다)·곧은 작은따옴표(앞뒤가 영문·숫자가 아닌 것), 블록 밖 `>` 줄 전체. 닫는 부호가 다음 3줄·300자 안에 있으면 여러 줄 인용, 끝내 없으면 줄 끝까지. 글자를 고치면 바뀜, 부호만 걷어내면 부호 빠짐, 차례가 바뀌면 자리 바뀜) · **판례 블록**(`[관련 판결]`·`[관련 판례]`·`[관련 판정]`·`[관련 결정]`(붙여 쓴 꼴·`【 】`·줄 중간·`###` 뒤 포함) 머리줄 + 빈 줄 건너 이어지는 `>` 줄, `>` 줄이 없으면 풍산식 원문 줄 — `check_citations` 와 한 벌인 `citationBlockRanges`. 줄머리 `>`·`**`·공백 폭 말고 글자 그대로, 글자가 같은 블록끼리 자리를 바꿔도 훼손. 블록으로 못 읽은 `[관련` 줄은 `unrecognized`) · **법령 용어**(근로자·근로자대표·사용자·신청인·피신청인·근로계약·취업규칙·임금·통상임금·평균임금·최저임금·퇴직금·해고·해고예고·징계·징계위원회·견책·감봉·정직·해임·정당한 이유·직장 내 괴롭힘·성희롱, `genre` legal 이면 법령 문장 꼴 하여야(= 해야)·할 수 있·아니하(= 않·못하) 도. 어간으로 센다. 당사자·징계 수위는 뒤 조사로 자리를 적어 두고, 용어 차례만 바뀌고 자리 차례는 그대로면 맞바꿈) · **당위·추측 표현**(당위 = ~아/어/여야 하다·필요가 있다·아니 된다·지 못한다 등, 추측 = 수 있·로 보인다·판단된다·사료된다·~고 본다·볼 여지·기 어렵 등, 권고 = 바람직하다·권장한다. 짝 문장 무리 안 개수가 줄면 사라짐, 늘면 생김. 개수는 같아도 표지가 붙은 말이 문장 안의 다른 절로 옮겨 가면 옮김. 줄바꿈에 걸친 표지도 센다) · **부정 표현**(않·못·아니·없·모르·안 ~·보기 어렵·부당·불법·위법·무효·불가·불허·미지급 등. 짝 문장 무리 안에서 생기거나 사라지면 훼손. 이중 부정 당위·대구·뿐만 아니라는 세지 않는다. 아니한다 → 않는다는 같다) · **대구**(~가/이 아니라·이기보다 등이 5개 이상에서 0개, 또는 짝 문장에서 두 항이 맞바뀜). 항목마다 `status`(보존됨/훼손)·`count`·`changes`(kind changed·removed·added·reordered·unquoted·lost·gained·moved·annihilated, 줄 `{before, after}`, 전후 짧은 글, 100건 + `truncated`·`total`). **글자 변경률** = 1 − 2 × 일치 글자 ÷ 양쪽 글자(공백 덩어리 한 칸). 닻 문장은 통째 일치, 바뀐 덩어리 안은 Myers 최장 공통 부분열. 걸음 예산을 넘으면 차례를 지키는 문장 짝마다 정확히 센 일치의 합(하한)으로 셈해 변경률은 실제 값의 상한이고 `approximate` — 어림으로 30% 미만이면 실제도 30% 미만이라 보존됨을 낼 수 있고, 어림이 넘치면 변경률 초과 쪽으로 기운다. 30% 이상 `level` 경고 · 50% 이상 중단(이상 = ≥, `percent` 는 내림). 문단을 옮긴 것도 바뀐 글자로 센다. 맨 위 `status` 하나 = 중단 > 훼손 > 경고 > 보존됨(변경률은 「변경률 초과」). 보존됨은 코드가 본 항목만 같다는 표시다. **못 잡는 것**: 이름·화자만 바꿈(갑 → 을), 반대말 동사(인정 → 부인)·증가 → 감소, 목록 밖 용어, 표지가 다른 표지로 바뀐 것(보인다 → 명백하다고 판단된다), 대구 4개 이하 → 0. **잘못 잡는 것**: 같은 무리 안 문장 차례를 바꾼 윤문의 수치·인용 자리 바뀜, 되풀이 용어·조문 줄임(근로자 → 그, 같은 법 제23조 → 같은 조), 100분의 50 → 50%, 사실 서술의 「지 못한다」를 당위로 셈. 입력은 NFC·폭 없는 문자 지움. 주민등록번호 모양(NFKC·대시류·폭 없는 문자를 고른 뒤)이 before·after 어디든 있으면 대조하지 않고 `rrnLines: {before, after}`(줄 번호만), 응답 글의 12자리 이상 숫자 열은 `*` 로 가린다. 오류는 고정 코드 `REWRITE_CHECK_FAILED`. 규칙은 공개(`lib/prose/preserve.mjs`, im-not-ai 발상 — THIRD_PARTY_NOTICES). 모델을 부르지 않는다 |
| `law` | `search_laws` | 법령 이름(또는 본문 낱말)으로 현행 법령 찾기 — 법령ID·판 번호·공포일·시행일·법제처 화면 주소(법제처 Open API) |
| `law` | `list_law_forms` | 법령 하나의 별표·별지 서식 목록 — 「별지 제8호서식」 표기·제목·공포일과 내려받을 파일 주소(한글·PDF) |
| `law` | `get_article_history` | 조문 하나가 바뀐 판들(제정·조문변경, 공포일·시행일·판 번호, 시행 예정 판 포함) |
| `law` | `search_precedents` / `get_precedent` | 판례 검색(낱말·사건번호·법원) · 판시사항·판결요지·참조조문·참조판례·전문 |
| `law` | `search_interpretations` / `get_interpretation` | 법령해석 검색·본문 — `source: moel` 고용노동부 법령해석(기본) · `moleg` 법제처 법령해석례 |
| `law` | `check_citations` | 판례 인용 대조 — 문서의 `[관련 판결]` 블록마다 인용 조각이 그 판결 전문에 글자 그대로 있는지(공백·따옴표·문장부호 무시, 「(중략)」·「…」 조각별). 전문은 붙여 넣은 `bodies` 먼저, 없으면 법제처(사건번호만 보냄 — 대법원은 대부분 있고 하급심은 대부분 없음). 일치·근사(0.85 이상)·불일치·전문 못 찾음(판결이 없다는 뜻 아님)·다른 법원 판결만 있음·요약(대조 제외). 모델을 부르지 않는다 |
| `nosa` | `make_council_meeting_docs` | **로컬 전용(파일 쓰기).** 회의 하나의 서류를 `kind` 로 골라 PDF·hwpx 로 — notice(소집 통보서·공고, 통보가 개최일 − 8일보다 늦으면 만들지 않음) · materials(회의자료: 안건 목록·보고사항 4칸·안건별 배경·현황·노사 제안·쟁점·요청 결정·전분기 이행 점검표) · minutes(별지 제3호서식 칸 7개 그대로 + 참석위원 서명 칸, 상세 회의록, 같은 이름의 `.json` 구조화 원본 — 안건 ID·구분·법조문 분류·제안 측·결과·이월) · resolution(의결사항 공지). 정족수·의결 문장은 `check_council_meeting` 과 같은 계산으로 넣고, 안건 설명·발언 요지는 입력만 싣습니다. 서명 칸은 비워 둡니다. 덮어쓰지 않습니다 |

### 묶음 고르기

- 기본은 전 묶음입니다.
- 명령줄 `--groups nhis,popbill` 또는 환경변수 `LLG_MCP_GROUPS=nhis,popbill` (둘 다 있으면 `--groups` 우선)
- `fax`·`sms` 는 `popbill` 의 다른 이름으로 받습니다.
- 없는 묶음 이름을 넣으면 서버가 뜨지 않고 있는 묶음 목록을 알려 줍니다.

```bash
npx -y k-labor --help
```

### docs 묶음 — 한글 읽기·채우기·되쓰기 (kordoc)

`read_hwp_as_markdown`·`fill_hwp_form`·`patch_hwp_from_markdown` 은 [kordoc](https://github.com/chrisryugj/kordoc)(MIT) 4.25.3 과 `@rhwp/core` 0.9.0(HWP 저장)을 의존성으로 설치해 부릅니다.

- **배포 단위 = 설치된 패키지.** kordoc 은 `dist/server.mjs` 에 묶지 않습니다(external). `dist` 만 따로 옮기면 서버는 뜨지만 세 도구는 첫 호출에서 「한글 문서 부품(kordoc)을 불러오지 못했습니다」로 멈춥니다. `npx -y k-labor` 또는 패키지 폴더에서 `npm ci` 한 설치본으로 씁니다.
- **설치 용량.** kordoc 은 선택 의존성(OCR·그림 처리)을 함께 받습니다 — `onnxruntime-node` 약 300MB, `@hyzyla/pdfium` 14MB, `zxing-wasm` 4MB, `sharp`. 세 도구는 OCR·그림 추출을 끄고 부르므로 이것들을 쓰지 않습니다. 용량을 줄이려면 선택 의존성을 빼고 설치합니다:

  ```bash
  npm.cmd ci --omit=optional      # 윈도 · 패키지 폴더(tools/k-labor)에서
  npm ci --omit=optional          # macOS·리눅스
  ```

  단, `--omit=optional` 은 contract 묶음의 스캔 회의록 문자 인식(`tesseract.js`·`@napi-rs/canvas`)도 함께 뺍니다.
- **한계.**
  - 되쓰기는 바뀐 글자만 고칩니다. 문단 추가·삭제(HWP 5.x 는 늘, hwpx 는 `structure:false` 기본), 표 구조 변경, 행 끝 공백 두 칸으로 낸 강제 줄바꿈은 되쓰지 않고 `skipped` 로 알립니다 — 한글에서 고칩니다.
  - kordoc CLI `patch` 의 대체본(`.rewrite.hwpx`)은 만들지 않습니다.
  - 라벨 일치는 접두 일치라 서식에 따라 엉뚱한 칸에 맞을 수 있습니다. `filled[].target` 과 한글 화면으로 확인합니다.
  - 주민등록번호 모양 값은 채우지 않습니다(주민번호 칸은 한글에서 직접).
### contract · calc 묶음

사이트 근로계약서 작성(/tools/contract-write)·점검(/tools/contract-check)과 계산기(/tools/min-wage·weekly-holiday-pay·headcount·take-home-pay·notice-pay·leave-pay·severance.html·holiday-pay·pay-proration·shutdown-allowance)의 엔진을 그대로 묶었습니다. 같은 입력이면 사이트와 같은 값이 나옵니다.

- **주민등록번호를 받지 않습니다.** 근로자 이름은 선택이고, 없으면 「근로자」로 적습니다. `check_contract` 는 입력에 주민등록번호 모양이 있으면 점검하지 않습니다.
- `design_contract_wage` 는 사업체명·근무장소·업무가 없어도 금액을 계산하고, 빠진 칸을 `contractFieldsMissing` 으로 알려 줍니다. `make_contract_files` 는 그 칸이 있어야 파일을 만들고, 이미 있는 파일은 덮어쓰지 않습니다.
- 결과 문구는 사이트 화면과 같습니다. 점검 규칙 글의 임금 구조 용어도 사이트처럼 「임금 구성」으로 바꿔 냅니다.
- 각 묶음 파일이 원격(HTTP)판에 실어도 되는 도구 목록을 내보냅니다 — `contractRemoteSafe`(설계·점검), `calcRemoteSafe`(전부). 파일을 쓰는 `make_contract_files` 는 `contractLocalOnly` 로 따로 표시했습니다.

```bash
claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups contract,calc
```

> 「주4 월화수목 10:00~22:00, 휴게 155분, 공휴일 22일, 월 260만원으로 근로계약서 임금 구성 짜 줘.」
> 「시급 10,320원, 주 22.5시간이면 주휴수당 얼마야?」

- `calc_holiday_pay` 는 월급에 휴일·연장 가산이 들어 있다는 약정 칸을 받지 않습니다(사이트 화면에만 있는 칸). 법정 기준 값만 냅니다. `total` 은 그날 일한 대가(휴일근로 임금 1.0배 + 가산)라 월급·일용·시급제가 같고, 월급제는 월급 외에 더 줄 금액입니다. 일용·시급제의 유급휴일 1일분은 `result.paid_holiday_day` 에 받는 조건과 함께 따로 냅니다.
- `calc_pay_proration` 은 회사 기준을 모르면 방식마다 값을 나란히 내고, 원 미만이 남는데 끝수 기준(`rounding`)이 없으면 금액을 `null` 로 둡니다.

### leave · tax · duties 묶음

- `leave` — 사이트 연차 계산기(/tools/leave)와 퇴직 정산(/tools/leave/settlement) 엔진. 날짜·일수만 받습니다. `settle_leave_on_exit` 는 빈 칸을 0 으로 보지 않고, 회계연도 쪽이 많을 때 취업규칙 재산정 규정 유무를 모르면 확정하지 않습니다(`verdict: insufficient-input`). `endDate` 는 마지막 재직일입니다(상실일 아님). 입사 첫해 월 단위 연차는 날짜로 정하고(1년차 발생 2018-05-29 이전 = 15일에 포함, 그 뒤 = 따로), `includeFirstYearMonthly` 는 호환용으로 받기만 합니다. 일수만 세고 금액은 `calc_leave_pay` 로 냅니다.
- `tax` — 퇴직소득세 계산기(/tools/retirement-tax) 엔진과 화면 문장(연금계좌로 받는 경우·원천징수영수증·홈택스 모의계산 안내)을 그대로 싣습니다.
- `duties` — 사이트 /duties 의 묶은 자료(법제처 현행 법령 원문 확인일 포함)와 같은 고르기 규칙(`src/lib/duties.ts`, 화면과 같은 함수)으로 답합니다. 네트워크를 쓰지 않습니다.
- 원격(HTTP)판에 실어도 되는 도구 = `leaveRemoteSafe`·`taxRemoteSafe`·`dutiesRemoteSafe`(전부).

```bash
claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups calc,leave,tax,duties
```

> 「2014년 1월 2일 입사, 2026년 7월 15일 퇴사, 퇴직금 6,000만원이면 퇴직소득세 얼마야?」
> 「상시 근로자 7명 사업장이 지켜야 할 의무 알려 줘.」

### work-rules 묶음

사이트 노동법 개정 알림판(/laws)의 자료(개정 이벤트·표준취업규칙 2026·매핑)와 「취업규칙 점검」 엔진을 그대로 묶었습니다. 같은 본문·같은 기간·같은 오늘이면 사이트 화면과 같은 항목이 나옵니다(묶을 때의 자료 기준).

- **법령 범위** — 저장소 `scripts/laws/labor_laws.json`(법령이 정한 노동 관계 법령 목록, 38개 법률)과 그 시행령·시행규칙(`subordinate_laws.json`)입니다.
- **법제처 Open API(DRF)** — 묶은 자료 뒤에 공포된 판과 조문 원문은 국가법령정보 공동활용 Open API 로 그때그때 받습니다. 본인 OC(이용자 ID)를 `LAW_OC` 에 넣어야 하고, 기본값은 없습니다. OC 가 없거나 법제처가 막으면 묶은 자료로만 답하고 그 사실을 응답(`live.error`·`liveError`)에 적습니다.
  - `list_law_revisions` 는 기본으로 실시간 확인을 더합니다(`live: false` 면 묶은 자료만). `law` 를 주면 그 법령들의 판 목록을, 안 주면 묶은 자료 생성일 뒤 공포분을 봅니다. 실시간으로 더한 개정에는 개정 요지·취업규칙 연결이 아직 없습니다.
  - `compare_law_versions` 는 두 판의 전문을 조문 단위로 직접 비교합니다. 법제처 본문의 「조문변경여부」 표시는 새로 생긴 조문을 놓쳐서(예: 근로기준법 2027. 1. 1. 판의 제44조의4) 쓰지 않습니다.
  - `check_work_rules_revisions`·`check_work_rules_file` 은 `refresh: true` 일 때 묶은 자료 뒤 공포분을 `liveAdditions` 로 따로 싣습니다. 자동 대조 결과는 바뀌지 않습니다. 법제처에는 날짜만 묻고 본문은 보내지 않습니다.
  - `make_work_rules_report_forms` 의 `changes[].lawRef` 를 주면 그 조문 원문을 받아 대비표 아래 「근거 법령 원문」에 글자 그대로 싣습니다.
  - **법제처는 해외 IP 를 막습니다.** 원격(HTTP)판에 올릴 때는 **국내 리전 필요(Vercel icn1)**. OC 신청 때 등록한 IP·도메인이 아니면 「사용자 정보 검증에 실패하였습니다」가 옵니다.
- **신고 서류** — 근로기준법 시행규칙 제15조·[별지 제15호서식] <개정 2021. 4. 5.> 신고서, 신·구 조문 대비표(변경신고), 의견청취서(제94조 제1항), 불리한 변경 동의서(같은 항 단서)를 만듭니다. 사업장명·대표자·상시 근로자 수 같은 칸이 비면 만들지 않고 빈 칸 목록을 돌려줍니다. 작성일은 기본 오늘이고, **서명·날인 칸은 비워 두며 응답에 「날인 필요」로 알립니다.** 이미 있는 파일은 덮어쓰지 않습니다. 제출은 사용자가 고용노동부 노동포털(민원신청 › 취업규칙·퇴직연금)이나 관할 지방고용노동관서에 합니다.
- PDF 글꼴(나눔고딕)에 없는 항 번호 ①~⑳ 은 원과 숫자로 그려 넣습니다. 그 밖에 글꼴에 없는 글자(한자 등)가 있으면 그 PDF 만 만들지 않고(`skipped`) 한글·워드 파일은 만듭니다.
- 원격(HTTP)판에 실어도 되는 도구 = `workRulesRemoteSafe`(목록·조문 원문·판 비교·글자 점검). 파일을 읽거나 쓰는 도구는 `workRulesLocalOnly`.
- 법령명·조문 원문·개정 요지는 법제처·사이트 자료 글자를 고치지 않고 싣습니다.

```bash
claude mcp add --scope user k-labor -e LAW_OC=내OC -- npx -y k-labor mcp --groups work-rules
```

> 「우리 취업규칙(C:/규정/취업규칙.hwpx) 2024-03-01 개정본인데, 그 뒤 시행된 노동법 개정 반영됐는지 봐 줘. 법제처 최신 공포분도 같이.」
> 「근로기준법 2026. 12. 8. 판과 2027. 1. 1. 판 뭐가 바뀌었는지 조문별로 보여 줘.」

### law 묶음 (법령·판례 조회)

법제처 국가법령정보 Open API(DRF)에서 법령 검색·별표서식·조문 연혁·판례·법령해석을 그때그때 받습니다. 도구 구성과 요청 대상은 [korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp)(MIT) v2.1.6 을 참고해 노무 실무에 쓰는 7개만 골랐습니다 — 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- **OC 는 `LAW_OC` 로만** 받습니다(도구 인자로 받지 않음). 없으면 도구가 부르지 않고 `LAW_OC` 를 넣으라고 알립니다.
- 조문 원문과 두 시점 비교는 `work-rules` 묶음의 `get_law_article`·`compare_law_versions` 가 맡습니다(이 묶음은 다시 만들지 않음 — 법제처 신구조문대비도 넣지 않음). `law` 만 켜면 조문 원문을 볼 수 없습니다. 함께 쓰려면 `--groups work-rules,law`.
- 법제처 응답의 상세 주소에는 OC 가 들어 있어 옮기지 않습니다. 돌려주는 주소는 OC 가 없는 법제처 화면(`lsInfoP.do`·`precInfoP.do`)과 별표·서식 파일(`flDownload.do`)뿐입니다.
- 판례·해석·조문 글자는 법제처 응답 그대로이고 `<br/>` 줄바꿈과 영문 태그만 정리합니다. 판례 전문은 기본 3만 자에서 자르고 `truncated` 로 알립니다.
- **원격(HTTP)판에 싣지 않습니다.** 법제처가 등록 IP 와 이용자별 OC 로만 받아, 서버 쪽 OC 를 어떻게 둘지 정하기 전까지 로컬 전용입니다.

```bash
claude mcp add --scope user k-labor -e LAW_OC=내OC -- npx -y k-labor mcp --groups "work-rules,law"
```

> 「연차 사용촉진에 관한 고용노동부 행정해석 찾아서 회답 원문 보여 줘.」
> 「근로기준법 시행규칙 서식 중 연장근로 인가 관련 서식 파일 주소 줘.」

---

## ⚙️ 환경변수

팩스·문자를 쓰려면 **본인 팝빌 계정**의 값을 넣어야 합니다. 이 패키지에는 기본 계정도, 기본 발신번호도 없습니다.
값이 빠지면 보내기 도구는 무엇이 빠졌는지(`missing`)를 돌려주고 아무것도 보내지 않습니다.

| 이름 | 필수 | 뜻 |
|---|---|---|
| `POPBILL_LINK_ID` | 팩스·문자 | 팝빌 연동 링크아이디 |
| `POPBILL_SECRET_KEY` | 팩스·문자 | 팝빌 연동 비밀키 |
| `POPBILL_CORP_NUM` | 팩스·문자 | 팝빌에 가입한 사업자등록번호(숫자 10자리) |
| `POPBILL_FAX_SENDER` | 팩스 | 팝빌에 등록한 팩스 발신번호(도구 인자 `sender` 로도 줄 수 있음) |
| `POPBILL_SMS_SENDER` | 문자 | 팝빌에 등록한 문자 발신번호(도구 인자 `sender` 로도 줄 수 있음) |
| `POPBILL_IS_TEST` | 선택 | 기본 `true`(팝빌 테스트환경). 운영환경으로 보내려면 `false` |
| `LLG_MCP_GROUPS` | 선택 | 켤 묶음(쉼표로 구분) |
| `LLG_SITE` | 선택 | 사업자번호 조회에 쓰는 사이트 주소(기본 `https://yellowenvelope.kr`) |
| `LAW_OC` | 법제처 실시간 | 법제처 국가법령정보 Open API 이용자 ID(OC). 기본값 없음. 없으면 `work-rules` 는 묶은 자료로만 답하고, `law` 는 부르지 않고 알립니다 |
| `LLG_ROOT` | 선택 | 개발용. 저장소 경로를 주면 서식·글꼴을 패키지 안이 아니라 저장소 `public/` 에서 읽습니다 |
| `LLG_TODAY` | 시험용 | 「오늘」을 그 날(YYYY-MM-DD)로 고정합니다(smoke 가 씁니다) |
| `LLG_DRF_BASE` | 시험용 | 법제처 Open API 주소를 바꿉니다(smoke 의 가짜 법제처) |

- 환경변수가 우선입니다. 없으면 `~/.claude/.env` 의 `POPBILL_*`·`LAW_OC` 줄을 읽습니다.
- 키 값은 도구 응답이나 로그 어디에도 찍지 않습니다.
- `find_branch` 와 `make_form` 은 팝빌 설정 없이 씁니다.

---

## 🔒 개인정보

- `make_form` 은 사람 명단을 **파일 경로(`peopleFile`)로만** 받습니다. 주민등록번호가 AI 대화에 실리지 않고, 도구가 파일을 직접 읽습니다.
- 주민등록번호는 이 PC 안에서 PDF 로만 만들어집니다. 도구 응답에는 싣지 않고, 응답에 주민등록번호 모양이 섞이면 나가기 전에 가립니다.
- 문자 본문에 주민등록번호 모양이 있으면 `send_sms` 가 보내지 않습니다.
- 팩스·문자는 `confirm:true` 를 준 호출에서만 실제로 나갑니다. 그 전에는 미리보기만 돌려줍니다.
- 밖으로 나가는 것은 네 가지뿐입니다. ① `find_branch` 에 사업자등록번호를 주면 그 번호만 일의 무늬 사이트로 보내 주소를 받아 옵니다(주소를 주면 아무것도 나가지 않습니다). ② `send_fax`·`send_sms` 는 본인 팝빌 계정으로 PDF·문자를 보냅니다. ③ `work-rules` 묶음은 법제처 Open API 에 법령명·날짜·판 번호만 묻습니다. 취업규칙 본문과 사업장 정보는 보내지 않습니다. ④ `law` 묶음은 법제처 Open API 에 사용자가 넣은 검색 낱말·법령명·번호를 보냅니다. 입력에 주민등록번호 모양이 있으면 보내지 않고 멈춥니다.
- 취업규칙 본문·파일은 이 PC 안에서만 대조합니다. 본문에 주민등록번호 모양이 있으면 점검하지 않고, 신고 서류 도구는 주민등록번호를 받지 않습니다.

## 🙅 하지 않는 일

- **신고를 접수하지 않습니다.** 신고서 PDF 를 만들고, 사용자가 확인한 뒤 **본인 팝빌 계정과 본인 번호로** 보내도록 돕는 데까지입니다. 공단 접수 여부와 처리 결과는 공단에서 확인해 주세요.
- 취업규칙 신고도 접수하지 않습니다. 서류를 만들고 날인이 필요한 곳을 알려 주는 데까지입니다.
- 취업규칙 대조는 낱말을 맞춰 본 1차 결과입니다. 바꿀 문안은 법이 정한 최저 기준이라 회사 사정에 맞게 확인한 뒤 씁니다.
- 받을 팩스 번호를 스스로 고르지 않습니다. `find_branch` 결과 가운데 사람이 확인한 번호만 씁니다. 고지서나 EDI 에 적힌 관리지사가 따로 있으면 그 지사가 우선입니다.
- 입력값을 저장하거나 모으지 않습니다.

---

## 🛠️ 개발 (저장소 안에서)

이 패키지는 사이트 엔진(`src/lib/nhis-forms`·`src/lib/branch-directory`)과 지사 데이터(`data/branch-directory/`)를 esbuild 로 묶어 서식이 사이트와 한 벌로 유지됩니다. 엔진을 고치면 다시 빌드해야 반영됩니다.

```bash
cd tools/k-labor
npm.cmd install
npm.cmd run build        # dist/server.mjs + dist/assets/(서식 PDF 2종·글꼴·OFL.txt, 계약서 PDF 용 나눔고딕·라이선스, hwp 읽기 rhwp WASM)
node dist/toego.mjs a.json  # 퇴고 가벼운 실행 파일 — a.json = {text, genre?, detail?, norms?:{checks?,quote?,warnOnly?}, semantic?:{genre?,text?}, rhetoric?:{track?,allA?}}(모르는 키 거절) → {ok, prose(check_prose 응답), norms(check_norms 응답), semantic?(check_semantic 응답), rhetoric?(check_rhetoric 응답)}. 의미범주·AI 수사는 그 키를 줄 때만 돌고(비공개 팩 필요), 장르·트랙은 키 안의 값만 본다(없으면 legal — 문체 `genre` 를 물려받지 않음). ok 는 돌린 검사가 모두 ok 일 때만 참(키를 줬는데 비공개 팩이 없으면 종료 코드 1). `rhetoric.allA` 면 A 는 500건 상한 없이 전부(발송 게이트용). 서버를 띄우지 않아 약 0.2초. 「-」 면 표준 입력에서 읽음(글이 파일로 남지 않게). 인자가 UTF-8 이 아니거나 JSON 이 아니면 종료 코드 2
node smoke.mjs           # 합성 값 시험, 전송 안 함. 법제처는 가짜 법제처(tests/fixtures/laws/drf 고정 응답)로
npm.cmd pack --dry-run   # 올라갈 파일 확인
```

- 셸에 `LAW_OC` 가 있으면 smoke 가 끝에서 실제 법제처를 work-rules 도구 두 번(조문 원문·판 비교)과 law 도구 네 번(판례 두 번·서식·고용노동부 해석)만 부르고, 없으면 `SKIP` 을 찍습니다.
- `work-rules` 묶음은 사이트 자료(`public/data/laws`)와 pdf.js 를 묶어 `dist/server.mjs` 가 약 17MB 이고, hwp 읽기 부품 `dist/assets/rhwp_bg.wasm`(약 12MB, 저장소 루트 `node_modules/@rhwp/core` 에서 복사)이 따로 붙습니다. wasm 이 없으면 hwp 파일만 「hwpx 로 저장해 다시」로 안내합니다.

- 새 묶음 = `groups/<이름>.mjs` 에 `register…(server)` 를 만들고 `server.mjs` 의 `GROUPS` 에 한 줄 더합니다.
- `contract`·`calc` 묶음은 저장소 루트의 의존성(exceljs·jszip 등)을 함께 묶으므로, 빌드 전에 저장소 루트에서도 `npm.cmd ci` 를 해 둡니다.
- 저장소 빌드본을 바로 등록할 때: `claude mcp add <이름> -s user -- node <이 폴더>/dist/server.mjs`

## 📄 라이선스

- 코드: MIT (`LICENSE`)
- 글꼴 `dist/assets/LLGFormsSans-Regular.ttf`: 나눔고딕(Copyright (c) 2010, NHN Corporation)을 줄이고 이름을 바꾼 것으로 SIL Open Font License 1.1 을 따릅니다. 전문은 `dist/assets/OFL.txt` 에 함께 들어 있습니다.
- 서식 PDF: 국민건강보험공단 공식 서식(빈 양식)
- 글꼴 `dist/assets/NanumGothic-Regular.ttf`(근로계약서·취업규칙 신고 서류 PDF): 나눔고딕(Copyright (c) 2010, NHN Corporation), SIL Open Font License 1.1. 전문은 `dist/assets/NanumGothic-OFL.txt`.
- `dist/assets/rhwp_bg.wasm`(hwp 읽기): rhwp, MIT. 전문은 `dist/assets/rhwp-LICENSE.txt`.
- 법령 원문: 법제처 국가법령정보 공동활용 Open API.
