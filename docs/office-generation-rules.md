# 문서 생성 규칙 (docx·xlsx·pptx·pdf·hwpx)

우리 TypeScript writer 가 지켜야 할 규칙만 추렸다. 출처는 Anthropic 문서 스킬(`third_party/anthropic-skills/skills/*/SKILL.md`, Apache-2.0)과 우리 hwpx 마감 검사 경험이다. 원문은 docx-js·openpyxl·pptxgenjs API 기준이라 여기서는 **날 OOXML·ExcelJS·hwpx XML 로 옮겨** 적었다.

판정은 2026-11-19 엔진 코드와 `npm run office:samples` 견본 검사 결과 기준이다. 검사 = `npm run office:check -- <파일>` (`tools/office-check/README.md`).

- **준수** — 코드와 견본 검사로 확인
- **위반** — 고칠 곳(file:line)
- **해당 없음** — 그 기능을 쓰지 않음

## 대상 writer

| writer | 산출물 |
|---|---|
| `src/lib/laws/doc-io.ts` `compareDocx` | 신구대조표 docx |
| `src/lib/rules-review/outputs.ts` `bundleDocx`·`reviewXlsx`·`requestXlsx` | 결재 묶음 docx·검토표 xlsx·의견 요청 xlsx |
| `src/lib/laws/comparison-xlsx.ts` | 신구대조 xlsx |
| `src/lib/leave/leave-xlsx.ts` | 연차 결과 xlsx |
| `src/lib/contract-write/export.ts` | 근로계약서 xlsx·hwpx·pdf |
| `src/lib/work-rules-report/render.ts` (`nosa-council/forms.ts` 가 씀) | 서식 hwpx·pdf |
| `src/lib/hwp/apply.ts` | 개정안 반영본 hwpx (rhwp 직렬화) |
| `src/lib/nhis-forms/build.ts` | 건강보험 신고 pdf |

## docx

| # | 규칙 | 판정 |
|---|---|---|
| D1 | **XSD 요소 순서를 지킨다.** `w:pPr` 안은 `keepNext → widowControl → … → spacing → ind → jc`, `w:tcPr` 안은 `tcW → … → shd → … → vAlign`, `w:tblPr` 안은 `tblW → … → tblBorders → shd → tblLayout → tblCellMar`, `w:tblCellMar` 안은 `top → left → bottom → right`. Word 는 대개 열어 주지만 엄격한 소비자(검증기·일부 편집기)는 거부한다 | 준수(PR #216 에서 고침) — `laws/doc-io.ts`·`rules-review/outputs.ts` 의 pPr·tcPr·tblPr·tblCellMar 순서를 바로잡고 견본이 XSD 검증을 통과함 |
| D2 | **zip 에 폴더 항목을 넣지 않는다.** 클라우드 공동 편집에서 폴더 항목이 있는 파일을 거부한 사례가 있다. JSZip 은 `word/document.xml` 을 넣으면 `word/` 를 따로 만든다 → `new JSZip()` 대신 `zip.file(name, data, { createFolders: false })` | 준수(PR #216 에서 고침) — `createFolders: false`, `laws/comparison-xlsx.ts` 도 폴더 항목 없음 |
| D3 | 용지 크기를 명시한다(`w:pgSz`). 가로는 너비·높이를 바꿔 적고 `w:orient="landscape"` | 준수 — `laws/doc-io.ts:128`, `rules-review/outputs.ts:235` (A4 가로 16838×11906) |
| D4 | 표 폭은 이중으로: `w:tblW`·`w:gridCol`·셀 `w:tcW` 모두 `dxa`, gridCol 합 = tblW (pct 는 일부 편집기에서 깨진다) | 준수 — `laws/doc-io.ts:123-127`, `rules-review/outputs.ts:222-226` |
| D5 | 칸 음영은 `w:shd w:val="clear" w:fill="…"`, `solid` 금지(검게 나온다) | 준수 |
| D6 | 글머리 기호를 글자(•)로 넣지 않는다 — 번호 매기기(`w:numPr`)로 | 준수 (본문에 기호 문자 없음) |
| D7 | 줄바꿈 문자(`\n`)를 `w:t` 에 넣지 않는다 — 문단을 나누거나 `<w:br/>` | 준수 — `laws/doc-io.ts:114`, `rules-review/outputs.ts:211` (`<w:br/>` 로 나눔) |
| D8 | 제목 문단은 `keepNext` 로 다음 문단과 붙인다 | 위반(경미) — `laws/doc-io.ts:116` 이 모든 문단에 `keepNext w:val="0"` (제목만 표와 다른 쪽에 남을 수 있다) |
| D9 | 표를 가로줄 대용으로 쓰지 않는다 · 점선 리더는 탭으로 | 해당 없음 |
| D10 | 생성 뒤 `validate.py` 를 돌리고 렌더해서 눈으로 본다 | 이번에 도입 — `npm run office:check` |

## xlsx

| # | 규칙 | 판정 |
|---|---|---|
| X1 | **수식 오류값 0.** 수식이 있으면 LibreOffice 로 재계산해 `errors_found` 가 없어야 한다 | 준수 — 모든 xlsx writer 가 수식을 쓰지 않는다(재계산 대상 없음) |
| X2 | 계산 모델이면 결과값을 박지 말고 수식으로 | 해당 없음 — 우리 xlsx 는 계산 모델이 아니라 판정·대조 결과 보고용이다. 사용자가 고쳐서 다시 계산하는 시트를 만들면 그때 적용 |
| X3 | 시트 이름 31자 이하 | 준수 (고정 이름: `rules-review/outputs.ts:302,328,340`, `laws/comparison-xlsx.ts:9,65`, `contract-write/export.ts:15`; `leave/leave-xlsx.ts:39` 은 호출자가 이름을 준다) |
| X4 | 남이 채울 통합문서는 어디를 채우는지 안내를 붙인다 | 준수 — `rules-review/outputs.ts:340` 「안내」 시트 |
| X5 | 가정·근거를 읽는 사람이 보는 자리에 적는다 | 준수 — `leave/leave-xlsx.ts` `notes`, `laws/comparison-xlsx.ts` foot |
| X6 | 글꼴을 명시한다(기본값에 맡기지 않는다). 한글 문서는 맑은 고딕 등 | 위반(경미) — `leave/leave-xlsx.ts:48,55,65,79,94`, `contract-write/export.ts:21,27,40,49`, `rules-review/outputs.ts:289` 이 크기·굵기만 주고 `name` 이 없다(ExcelJS 기본 Calibri). `laws/comparison-xlsx.ts` 는 준수 |
| X7 | zip 폴더 항목 없음 | 위반 — ExcelJS 가 폴더 항목 6개를 넣는다(모든 xlsx). 라이브러리 기본 동작이라 고치려면 `writeBuffer()` 결과를 JSZip 으로 다시 묶어야 한다. 경고로만 둔다 |
| X8 | 새 수식 칸에는 `numFmt` 를 준다(날짜가 숫자로 보이지 않게) · 교차 시트 참조에서 공백 있는 시트 이름은 따옴표 · `XLOOKUP`·`FILTER` 등 동적 배열 함수 금지 | 해당 없음 (수식 없음) |

## pptx

pptx writer 가 없다. 검사 경로(`validate.py` 의 PPTX 검증기)는 python-pptx 로 만든 1장짜리 파일로 돌아가는 것만 확인했다(PASS). 엔진 산출물로는 시험하지 못했다. 만들게 되면 지킬 것: 레이아웃을 먼저 정하고(16:9 = 10″×5.625″), 색은 `#` 없는 6자리 hex, 그림자 offset ≥ 0, 누적 막대 데이터 레이블에 `outEnd` 금지, 보조축 콤보 차트는 `valAxes`·`catAxes` 둘 다, `<p:presentation>` 자식 순서를 바꾸지 않는다, 글머리 기호는 글자 대신 `a:buChar`, 생성 뒤 `validate.py`.

## pdf

| # | 규칙 | 판정 |
|---|---|---|
| P1 | 글자를 추출할 수 있어야 한다(그림만 있는 쪽 금지) | 준수 — 근로계약서·서식·건강보험 견본 모두 추출됨 |
| P2 | 글꼴을 포함한다 | 검사기 경고 없음 (미포함 글꼴 검사는 표준 14 글꼴 PDF 로 따로 시험하지 않았다) |
| P3 | 글꼴에 없는 글자를 쓰지 않는다(원문은 「ReportLab 에 유니코드 위·아래 첨자 금지」). 그리기 전에 글리프를 확인 | 준수 — `contract-write/export.ts:167`, `work-rules-report/render.ts:71`, `nhis-forms/build.ts:287` `missingGlyphs` |

## hwpx

| # | 규칙 | 판정 |
|---|---|---|
| H1 | `mimetype` 이 첫 항목·무압축·`application/hwp+zip` | 준수 — `contract-write/export.ts:137`, `work-rules-report/render.ts:306` |
| H2 | header.xml `itemCnt` = 실제 개수. 항목을 더하면 다시 센다 | 준수 (고정 header — `contract-write/hwpx-header.ts`) |
| H3 | 모든 `*IDRef` 가 header 에 있는 id 를 가리킨다 | 준수 |
| H4 | 표 셀 `cellAddr` 의 `rowAddr` 를 행마다 넣는다(전부 0 이면 한글이 멈춘다) · `rowCnt`·`colCnt` 일치 | 준수 |
| H5 | **긴 표는 「글자처럼 취급」(`treatAsChar="1"`)하지 않는다.** 쪽을 못 넘어 통째로 밀리고 빈 쪽이 생기며 그 공백은 편집도 안 된다. 짧은 표만 1, 긴 표는 0 + `pageBreak="CELL"`(행 단위로 나누려면 `TABLE`). 기준 예: 추정 높이가 본문 높이의 55% 이상이면 0 | 준수(PR #216 에서 고침) — `work-rules-report/render.ts` 가 긴 표를 나눠 `treatAsChar="0"` 으로 낸다 |
| H6 | `repeatHeader="1"` 이면 첫 행 셀에 `header="1"` 도 넣는다(없으면 머리행이 반복되지 않는다) | 준수 — `work-rules-report/render.ts:273`. `hwp/apply.ts` 반영본은 원본 표 속성을 그대로 옮기므로 원본에 따라 다르다(견본 원본 표가 이 경우였다) |
| H7 | 본문 글자를 예시 서식(파란색·기울임)으로 두지 않는다 — 바탕 서식을 복사해 쓰면 예시 글자의 서식이 따라온다 | 준수 (자체 header, 본문 검정) |
| H8 | 빈 답(「→」만 있는 런)·서식 안내문(「작성할 것」·「예시)」)을 남기지 않는다 | 준수 |
| H9 | **바탕 문서의 `Preview/`·`BinData/`·메타를 그대로 싣지 않는다.** 다른 문서를 바탕으로 쓰면 그 문서의 첫 쪽 미리보기가 산출물마다 실린다. 글자 검사로는 안 잡힌다 | 준수 (writer 가 바탕 문서 없이 처음부터 만든다). `hwp/apply.ts` 는 원본 자신의 미리보기를 유지한다 |
| H10 | XML 을 직접 고친 hwpx 는 `linesegarray` 를 지운다(낡은 줄 배치 캐시 → 「손상」 경고) | 준수 (생성기는 넣지 않음, rhwp 는 새로 계산해 넣음) |
| H11 | em dash(—) 를 쓰지 않는다 · 쌍점 앞 띄어쓰기 금지 | 준수 — 서식·회의록·선거 서류 본문의 em dash 를 모두 걷어냄(`forms.ts`·`meeting.ts`·`election-docs.ts`). 도구 경고문·주석에는 남아 있으나 문서에 실리지 않는다 |
| H12 | 제목 문단은 `keepWithNext="1"` — 다만 **다음이 표면 이어지지 않는다**(장 제목을 쪽 나눔으로 시작) | 부분 준수 — `contract-write/hwpx-header.ts` 문단 모양 30개 중 4개가 keepWithNext=1. `work-rules-report/render.ts` 는 같은 header 를 쓴다 |
| H13 | 어절 단위 줄나눔(`breakNonLatinWord`): `KEEP_WORD` 가 실제로는 글자 단위로 끊긴 사례와, `BREAK_WORD` 로 바꾸자 양쪽 정렬 줄이 크게 벌어진 사례가 둘 다 있다 | **확인 필요** — `contract-write/hwpx-header.ts` 는 KEEP_WORD 24·BREAK_WORD 6. 검사기에는 넣지 않았다. 렌더해서 눈으로 판정 |
| H14 | 쪽 배치(제목·서명부가 쪽 끝에 홀로, 빈 쪽)는 XML 로 판정할 수 없다 — 렌더 PDF 를 만들어 본다 | 검사기는 옆에 같은 이름 PDF 가 있을 때만 쪽수·빈 쪽·마지막 쪽을 본다. 엔진에 hwpx→pdf 렌더 경로가 없어 이번 견본에서는 건너뜀 |

### 마크다운→hwpx 내부 생성기에는 있고 TS 엔진에는 없는 것

내부 md→hwpx 생성기가 갖춘 기능 중 `work-rules-report/render.ts`·`contract-write/export.ts` 에 없는 것. 지금은 옮기지 않고 목록만 둔다.

- **표 배치 자동 판단** — 추정 높이(열 폭·글자 수로 줄 수 계산)가 본문 높이의 55% 미만이면 글자처럼 취급, 이상이면 떠 있는 표 + 셀 단위 쪽 넘김 (H5 를 고치는 방법)
- **열 폭 자동 배분** — 열별 최장 표시 폭(한글 2·반각 1) 비례, 머리행 글자가 한 줄에 들어가는 하한(「담당부 서」처럼 끊기지 않게), 7열 이상이면 작은 글자
- **md 정렬 구문**(`:---:`·`---:`) → 셀 가운데·오른쪽 정렬, 셀 안 `<br>` → 줄바꿈
- **서식 프리셋** — 내부용·제출용(위원회·법원) 두 벌: 글꼴·본문/제목 크기·행간(160%/200%)·여백(제출용 위 45mm)
- **인라인 굵게**(`**…**`)와 판례 인용(「대법원 … 선고 … 판결」) 자동 굵게
- **장 앞 쪽 나눔**(로마 숫자 장 제목) · 제목 문단 keepWithNext · 하단 가운데 쪽 번호 「- N -」
- **서명부 인식** — 문서 끝 날짜 줄 이후를 오른쪽 정렬
- **곧은 따옴표 → 방향 있는 따옴표** 변환
- header 에 서식을 더할 때 `itemCnt` 를 실제 개수로 다시 세기 (H2 를 유지하는 방법)

## 견본 검사 결과 (2026-11-19)

`npm run office:samples` — 합성 데이터, LibreOffice 있음.

| 견본 | 결과 | 요지 |
|---|---|---|
| laws-compare.docx | **FAIL** | XSD 3건(D1: tblBorders·widowControl·shd 순서, 고치면 tblCellMar 1건이 더 드러난다), 폴더 항목 2 |
| rules-bundle.docx | **FAIL** | XSD 2건(D1: tblBorders·shd 순서, 고치면 tblCellMar 1건), 폴더 항목 2 |
| laws-comparison.xlsx·leave.xlsx·contract.xlsx·rules-review.xlsx·rules-request.xlsx | PASS | 폴더 항목 6 경고(X7), 수식 없음 |
| contract.hwpx | PASS | 표 1 |
| nosa-forms.hwpx | PASS (경고 2) | 31행 표 글자처럼 취급(H5), em dash 4(H11) |
| hwp-apply.hwpx | PASS (경고 1) | 원본 표의 repeatHeader 에 header 행 없음(H6) |
| contract-pdf.pdf·nosa-forms-pdf.pdf·nhis-loss.pdf | PASS | 글자 추출·글꼴 포함 |
| 일부러 깨뜨린 견본 4개 | 모두 FAIL(기대대로) | mimetype 순서·예시 서식 색·#DIV/0!·#REF!·잘린 XML |
