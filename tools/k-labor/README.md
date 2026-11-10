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

### 묶음 고르기

- 기본은 전 묶음입니다.
- 명령줄 `--groups nhis,popbill` 또는 환경변수 `LLG_MCP_GROUPS=nhis,popbill` (둘 다 있으면 `--groups` 우선)
- `fax`·`sms` 는 `popbill` 의 다른 이름으로 받습니다.
- 없는 묶음 이름을 넣으면 서버가 뜨지 않고 있는 묶음 목록을 알려 줍니다.

```bash
npx -y k-labor --help
```

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

- `calc_holiday_pay` 는 월급에 휴일·연장 가산이 들어 있다는 약정 칸을 받지 않습니다(사이트 화면에만 있는 칸). 법정 기준 값만 냅니다.
- `calc_pay_proration` 은 회사 기준을 모르면 방식마다 값을 나란히 내고, 원 미만이 남는데 끝수 기준(`rounding`)이 없으면 금액을 `null` 로 둡니다.

### leave · tax · duties 묶음

- `leave` — 사이트 연차 계산기(/tools/leave)와 퇴직 정산(/tools/leave/settlement) 엔진. 날짜·일수만 받습니다. `settle_leave_on_exit` 는 빈 칸을 0 으로 보지 않고, 회계연도 쪽이 많을 때 취업규칙 재산정 규정 유무를 모르면 확정하지 않습니다(`verdict: insufficient-input`). 일수만 세고 금액은 `calc_leave_pay` 로 냅니다.
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
| `LAW_OC` | 법제처 실시간 | 법제처 국가법령정보 Open API 이용자 ID(OC). 기본값 없음. 없으면 `work-rules` 는 묶은 자료로만 답합니다 |
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
- 밖으로 나가는 것은 세 가지뿐입니다. ① `find_branch` 에 사업자등록번호를 주면 그 번호만 일의 무늬 사이트로 보내 주소를 받아 옵니다(주소를 주면 아무것도 나가지 않습니다). ② `send_fax`·`send_sms` 는 본인 팝빌 계정으로 PDF·문자를 보냅니다. ③ `work-rules` 묶음은 법제처 Open API 에 법령명·날짜·판 번호만 묻습니다. 취업규칙 본문과 사업장 정보는 보내지 않습니다.
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
node smoke.mjs           # 합성 값 시험, 전송 안 함. 법제처는 가짜 법제처(tests/fixtures/laws/drf 고정 응답)로
npm.cmd pack --dry-run   # 올라갈 파일 확인
```

- 셸에 `LAW_OC` 가 있으면 smoke 가 끝에서 실제 법제처를 도구 두 번(조문 원문·판 비교)만 부르고, 없으면 `SKIP` 을 찍습니다.
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
