# office-check

엔진이 만든 문서 파일(docx·pptx·xlsx·hwpx·pdf)을 한 명령으로 검사한다. 개발·CI 도구이고 앱 번들에는 들어가지 않는다.

```bash
npm run office:check -- 산출물.docx 산출물.hwpx 산출물.xlsx
npm run office:check -- --strict 산출물.hwpx   # WARN 도 실패로 본다
npm run office:samples                          # 엔진 writer 견본을 만들어 검사(아래)
```

종료 코드: 0 = ERROR 없음(`--strict` 면 WARN 도 없음), 1 = 발견 있음, 2 = 실행 불가(파이썬·의존성 없음).

## 필요한 것

- Python 3.10 이상 + `defusedxml`·`lxml`·`openpyxl`·`pypdf` (`pip install defusedxml lxml openpyxl pypdf`). `check.mjs` 가 `PYTHON` → `python3` → `python` → `py` 순으로 이 넷이 다 있는 것을 고른다.
- LibreOffice(`soffice`)는 선택. 있으면 xlsx 수식을 다시 계산해 본다. PATH 에 없으면 흔한 설치 경로(`C:\Program Files\LibreOffice\program` 등)를 찾아 보고, 그래도 없으면 `skipped: soffice not found` 로 넘어간다.

## 형식별로 보는 것

| 형식 | 검사 |
|---|---|
| docx·pptx | zip·XML 정형성 → Anthropic 검증기(`third_party/anthropic-skills/scripts/office/validate.py`, XSD·패키지 규칙). docx 는 생성 규칙(용지 크기 명시·글머리 기호 문자·`shd solid`·표 폭 dxa 와 gridCol 합) 경고를 더한다 |
| xlsx | zip·XML 정형성 → 캐시된 오류값(#REF!·#DIV/0!·#VALUE!·#NAME? 등) 스캔 → 수식이 있고 soffice 가 있으면 **임시 복사본**에서 재계산(`run_recalc.py` → 벤더 `recalc.py`). Anthropic 검증기는 xlsx 에 XSD 검사를 하지 않는다 |
| hwpx | `hwpx_checks.py` — 아래 표 |
| pdf | 열림·쪽수·글자 추출 가능·빈 쪽·글꼴 미포함·남은 양식 필드 |

### hwpx 검사

| 수준 | 코드 | 내용 |
|---|---|---|
| ERROR | mimetype | 첫 항목이 `mimetype`, 무압축(STORED), 값 `application/hwp+zip` |
| ERROR | xml | 모든 XML 부분이 정형 |
| ERROR | itemCnt | header.xml 의 `itemCnt` 가 실제 자식 수와 같다(다르면 한글이 「손상」으로 본다) |
| ERROR | idref | `charPrIDRef`·`paraPrIDRef`·`borderFillIDRef`·`styleIDRef` 가 header.xml 에 있는 id 를 가리킨다 |
| ERROR | table | `rowCnt` = `<hp:tr>` 수, 각 셀 `rowAddr` = 행 번호(전부 0 이면 한글이 읽다 멈춘다), `colAddr+colSpan ≤ colCnt` |
| ERROR | style | 60자 이상 본문 런이 검정이 아닌 색이나 기울임 — 빈 서식의 예시 글자 서식이 남은 것 |
| ERROR | empty-answer | 런이 「→」 하나뿐 — 답을 채우지 않은 칸 |
| ERROR | form-text | 서식 안내문(「작성할 것」·「예시)」 등)이 남음 |
| WARN | style | 8자 이상 런(표 칸 포함)이 검정이 아닌 색·기울임 — 의도한 것인지 확인 |
| WARN | table | `repeatHeader="1"` 인데 첫 행 셀에 `header="1"` 이 없음(머리행이 반복되지 않는다) · 15행 넘는 표가 「글자처럼 취급」(쪽을 못 넘어 통째로 밀린다) |
| WARN | text | em dash · `###` · 쌍점 앞 띄어쓰기(「성 명 :」 제외) |
| WARN | preview·bindata | 미리보기 글이 본문에 없음 · 본문이 참조하지 않는 BinData — 바탕 문서에서 따라온 것일 수 있다 |
| INFO | preview·lineseg | 미리보기 그림 있음(눈으로 확인) · `linesegarray` 있음(XML 을 직접 고쳤다면 지운다) |

같은 이름의 `.pdf` 가 옆에 있으면 렌더 결과로 보고 쪽수·빈 쪽·마지막 쪽 글자 수·em dash 를 함께 본다. 없으면 `skipped` 로 남긴다 — 쪽 배치(제목이 쪽 끝에 홀로 남기 등)는 렌더해서 눈으로 봐야 잡힌다.

## 견본 검사 (`npm run office:samples`)

`tests/office-check/samples.test.ts` 가 각 엔진 writer 로 합성 데이터 견본을 만들고 이 검사기를 돌린다. 일부러 깨뜨린 견본 4개(mimetype 순서·예시 서식 색·수식 오류·잘린 XML)가 모두 실패로 잡히는지도 본다. 파이썬 의존성이 없으면 건너뛴다. `OFFICE_CHECK_OUT=<폴더>` 를 주면 견본과 `office-check-report.txt` 를 그 폴더에 남긴다. 기본 `npm test` 에는 들어가지 않는다.

## 출처

- docx·pptx·xlsx·pdf 검증 스크립트와 스키마: Anthropic Agent Skills(Apache-2.0) — `third_party/anthropic-skills/NOTICE`
- hwpx 검사: 내부 hwpx 마감 검사기에서 일반 규칙만 옮겨 다시 쓴 것
- 생성 규칙 요약: `docs/office-generation-rules.md`
