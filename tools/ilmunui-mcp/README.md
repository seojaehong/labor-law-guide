# ilmunui-mcp

[일의 무늬](https://yellowenvelope.kr)가 만드는 도구를 **내 PC 의 AI(Claude Code·Claude Desktop 등)** 에서 쓰도록 한 패키지로 묶은 로컬 MCP 서버입니다.
도구는 **묶음(group)** 단위로 들어 있고, 필요한 묶음만 켤 수 있습니다. 묶음은 앞으로 늘어납니다.

> [!NOTE]
> 아직 npm 에 올리지 않은 준비판입니다. 아래 설치 줄은 배포 뒤에 그대로 쓰는 형태입니다.

---

## 🚀 설치 (내 PC)

Node.js 20 이상만 있으면 됩니다.

### Claude Code

```bash
claude mcp add --scope user ilmunui -- npx -y ilmunui-mcp mcp
```

일부 묶음만 켜려면 `--groups` 를 붙입니다.

```bash
claude mcp add --scope user ilmunui -- npx -y ilmunui-mcp mcp --groups nhis
```

### Claude Desktop

`claude_desktop_config.json` 에 추가합니다.

```json
{
  "mcpServers": {
    "ilmunui": {
      "command": "npx",
      "args": ["-y", "ilmunui-mcp", "mcp"],
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
    "ilmunui": { "command": "cmd", "args": ["/c", "npx", "-y", "ilmunui-mcp", "mcp"] }
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

### 묶음 고르기

- 기본은 전 묶음입니다.
- 명령줄 `--groups nhis,popbill` 또는 환경변수 `LLG_MCP_GROUPS=nhis,popbill` (둘 다 있으면 `--groups` 우선)
- `fax`·`sms` 는 `popbill` 의 다른 이름으로 받습니다.
- 없는 묶음 이름을 넣으면 서버가 뜨지 않고 있는 묶음 목록을 알려 줍니다.

```bash
npx -y ilmunui-mcp --help
```

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
| `LLG_ROOT` | 선택 | 개발용. 저장소 경로를 주면 서식·글꼴을 패키지 안이 아니라 저장소 `public/` 에서 읽습니다 |

- 환경변수가 우선입니다. 없으면 `~/.claude/.env` 의 `POPBILL_*` 줄을 읽습니다.
- 키 값은 도구 응답이나 로그 어디에도 찍지 않습니다.
- `find_branch` 와 `make_form` 은 팝빌 설정 없이 씁니다.

---

## 🔒 개인정보

- `make_form` 은 사람 명단을 **파일 경로(`peopleFile`)로만** 받습니다. 주민등록번호가 AI 대화에 실리지 않고, 도구가 파일을 직접 읽습니다.
- 주민등록번호는 이 PC 안에서 PDF 로만 만들어집니다. 도구 응답에는 싣지 않고, 응답에 주민등록번호 모양이 섞이면 나가기 전에 가립니다.
- 문자 본문에 주민등록번호 모양이 있으면 `send_sms` 가 보내지 않습니다.
- 팩스·문자는 `confirm:true` 를 준 호출에서만 실제로 나갑니다. 그 전에는 미리보기만 돌려줍니다.
- 밖으로 나가는 것은 두 가지뿐입니다. ① `find_branch` 에 사업자등록번호를 주면 그 번호만 일의 무늬 사이트로 보내 주소를 받아 옵니다(주소를 주면 아무것도 나가지 않습니다). ② `send_fax`·`send_sms` 는 본인 팝빌 계정으로 PDF·문자를 보냅니다.

## 🙅 하지 않는 일

- **신고를 접수하지 않습니다.** 신고서 PDF 를 만들고, 사용자가 확인한 뒤 **본인 팝빌 계정과 본인 번호로** 보내도록 돕는 데까지입니다. 공단 접수 여부와 처리 결과는 공단에서 확인해 주세요.
- 받을 팩스 번호를 스스로 고르지 않습니다. `find_branch` 결과 가운데 사람이 확인한 번호만 씁니다. 고지서나 EDI 에 적힌 관리지사가 따로 있으면 그 지사가 우선입니다.
- 입력값을 저장하거나 모으지 않습니다.

---

## 🛠️ 개발 (저장소 안에서)

이 패키지는 사이트 엔진(`src/lib/nhis-forms`·`src/lib/branch-directory`)과 지사 데이터(`data/branch-directory/`)를 esbuild 로 묶어 서식이 사이트와 한 벌로 유지됩니다. 엔진을 고치면 다시 빌드해야 반영됩니다.

```bash
cd tools/ilmunui-mcp
npm.cmd install
npm.cmd run build        # dist/server.mjs + dist/assets/(서식 PDF 2종·글꼴·OFL.txt)
node smoke.mjs           # 합성 값 시험, 전송 안 함
npm.cmd pack --dry-run   # 올라갈 파일 확인
```

- 새 묶음 = `groups/<이름>.mjs` 에 `register…(server)` 를 만들고 `server.mjs` 의 `GROUPS` 에 한 줄 더합니다.
- 저장소 빌드본을 바로 등록할 때: `claude mcp add <이름> -s user -- node <이 폴더>/dist/server.mjs`

## 📄 라이선스

- 코드: MIT (`LICENSE`)
- 글꼴 `dist/assets/LLGFormsSans-Regular.ttf`: 나눔고딕(Copyright (c) 2010, NHN Corporation)을 줄이고 이름을 바꾼 것으로 SIL Open Font License 1.1 을 따릅니다. 전문은 `dist/assets/OFL.txt` 에 함께 들어 있습니다.
- 서식 PDF: 국민건강보험공단 공식 서식(빈 양식)
