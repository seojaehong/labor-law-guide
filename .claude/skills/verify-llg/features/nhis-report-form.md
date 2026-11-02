# 건강보험 자격 취득·상실 신고서 작성

늦어진 건강보험 직장가입자 자격 취득(별지 6호)·상실(별지 8호) 신고서를 공식 서식 1쪽에 채우고, 2쪽에 사업주확인서(지연사유)를 붙여 PDF 한 파일로 내려받는다. 작성 도구이지 제출을 맡지 않는다(행정사법 §2·§3, 261102 결정). 엔진 = `src/lib/nhis-forms/build.ts`(sanjae-apply overlay.ts 사본).

## Sub-features

- `nf-branch` 사업장 주소 → `/api/tools/branch-directory` 의 건보 결과로 받을 지사 자동 입력(후보 여럿이면 고르기, 직접 입력 가능). 주소만 서버로 간다.
- `nf-loss` 상실 — 마지막 근무일 입력 → 「상실일 = 다음 날」 표시, 상실부호·보수 총액·근무개월수.
- `nf-acq` 취득 — 취득일·월 보수액·취득부호, 6개월 이상 지연 시 입사 시점 입증서류 첨부 안내.
- `nf-pdf` 브라우저 안에서 PDF 생성(주민번호 서버 미경유), 1MB 이하(약 500KB), 도장 PNG 선택.

## How to get to it (user POV)

- `/tools` 목록 「건강보험 자격 취득·상실 신고서 작성」, 또는 `/tools/nhis-report-form`.

## Driving it with verify.mts

- `drive --feature nhis-report-form` — 청주 서문동 주소 → 청주동부지사 자동 입력 → 합성 1명(김가상·900101-1000000·마지막 근무일 2026-05-31) → 「상실일 2026.06.01」 → PDF 내려받기(`%PDF`, 1MB 이하) → 결과 「PDF nKB」 → **주민번호가 실린 요청 0건 · 다른 출처 요청 0건**.
- 내려받은 PDF 를 `<out>/nhis-report-form-<폭>.pdf` 로 남긴다. **글자가 실제로 그려졌는지는 렌더 그림으로 본다** — pdf-lib 서브셋 사고(261102)는 글자 추출이 정상이라 단계 검사로 안 잡힌다.

## Gotchas

- 서식 글꼴 = `public/fonts/llg-forms/LLGFormsSans-Regular.ttf`(나눔고딕을 한글 음절+기호로 줄이고 OFL 예약 이름을 피해 개명, `scripts/nhis-forms/make_font.py`). 채우기는 `subset:false` 가 전제다.
- 6호는 구분 칸 번호(1~4)가 인쇄돼 있어 번호를 찍지 않는다. 8호 일련번호는 찍는다.
- 한 장에 4명까지. 글꼴에 없는 글자(한자)는 오류로 거부한다.
