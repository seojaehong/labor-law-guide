# 제3자 고지 (Third-party notices)

k-labor 는 아래 오픈소스를 참고해 일부를 옮겼습니다. 묶은 판(`dist/server.mjs`)에도 해당 파일 머리의 고지가 그대로 남습니다.

## korean-law-mcp

- 저장소: https://github.com/chrisryugj/korean-law-mcp
- 참고한 판: v2.1.6 (npm `korean-law-mcp`)
- 옮긴 곳: `lib/law-open.mjs`, `groups/law.mjs` (`law` 묶음)
- 옮긴 것: 법제처 국가법령정보 Open API 의 요청 대상·인자(판례 `prec`, 법령해석례 `expc`, 조문 연혁 `lsJoHstInf`, 별표서식 `licbyl`), 조문 번호 6자리 코드 변환, 응답 칸 이름, 도구 구성. 코드는 JSON 응답을 받도록 새로 썼고, 고용노동부 법령해석(`moelCgmExpc`)은 k-labor 가 더했습니다.

```
MIT License

Copyright (c) 2025 Chris

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## kordoc

- 저장소: https://github.com/chrisryugj/kordoc (MIT, Copyright (c) 2026 chrisryugj)
- 쓰는 판: 4.25.3 (npm `kordoc`, 정확한 판 고정) · HWP 저장에 `@rhwp/core` 0.9.0 (MIT)
- 쓰는 곳: `lib/hangul-kordoc.mjs` → `docs` 묶음 `read_hwp_as_markdown`·`fill_hwp_form`·`patch_hwp_from_markdown`
- 코드를 옮기지 않고 의존성으로 설치해 라이브러리 API(`parse`·`fillHwpx`·`hwpToHwpx`·`hwpxToHwp`·`patchHwp`·`patchHwpx`)를 부른다. 묶은 판(`dist/server.mjs`)에도 들어가지 않는다(외부 모듈). kordoc 과 그 의존성의 고지는 설치된 `node_modules/kordoc`(LICENSE·NOTICE·THIRD_PARTY/)에 있다.

## im-not-ai (humanize-korean)

- 저장소: https://github.com/epoko77-ai/im-not-ai (MIT, Copyright (c) 2026 epoko77-ai)
- 참고한 판: 커밋 c07df14 · `skills/humanize-korean/references/lexicon.json` v1.3
- 옮긴 곳: `lib/prose/generic-pack.json` (`docs` 묶음 `check_prose` 의 범용 팩)
- 옮긴 것: lexicon 전 115항목(change 61·conditional 54)을 규칙 하나씩으로. 좁은 탐지식 `regex`·`regex_exclude` 는 그대로 옮기되 다음만 바꿨다.
  - L-05·L-54 — 좁은 식에서 「한」(L-05)·「작용」(L-54)을 뺐다(상류 v2.4.3 이 `regex_detect` 에 한 정밀화와 같다).
  - L-08·L-54·INJ-03·INJ-09·INJ-29·INJ-30 — 제외어를 `regex_exclude` 와 `regex_detect_exclude` 의 합으로(상류 음성 예문 `test_detect_neg` 가 좁은 식에 걸렸다).
  - L-04·L-17·L-24·L-51 — 띄어쓰기 없는 긴 한글(L-24 는 한글·영문) 줄에서 느려지지 않게, 끝없는 글자 묶음으로 시작하는 갈래 앞에 경계 `(?<![가-힣])`(L-24 `(?<![가-힣A-Za-z])`)를 붙였다. 이 앞 경계만으로는 앞 일치가 그 덩어리 가운데에서 끝난 바로 그 자리에서 시작하는 일치를 놓치므로, 원래 식을 `resume` 으로 함께 싣고 실행기가 그 자리에서만 원래 식을 다시 본다 — 합친 결과는 원래 식과 같다.
  - AST-44·L-32·L-78·L-79·L-87·INJ-08 — 맨 뒤에서 경계(공백·쉼표)를 먹던 `\s`·`[,\s]` 를 앞보기 `(?=…)` 로 바꿨다. 걸리는 자리(시작 칸)는 상류 식과 같고 걸린 글자에서 경계 글자만 빠진다(물러서기가 경계 공백 한 칸 겹침을 같은 자리로 보지 않게).
  - 표제어는 고칠 말 글에 실었다. `skip_genres` 는 우리 장르로 옮겼다(일반 → general, 보고서 → consulting, 논문은 대응 장르가 없어 쓰지 않음). 제외어를 후보 앞뒤 12글자 안에서 찾는 방식은 `scripts/lexical_layer.py` 를 따랐다(단 창은 줄 안에서만 본다 — 상류는 글 전체).
  - 등급(전부 B)·법률 트랙 keep/change 판정(keep 5항목은 `skipGenres: [legal, official]`)·사유·출력 방식과 규칙 실행기(`lib/prose/check.mjs`)는 k-labor 가 새로 썼다.
- 시험 픽스처: 같은 115항목의 합성 예문(`test_positive`·`test_negative`·`test_detect_neg`)을 그대로 `tests/fixtures/prose/imnotai-lexicon-examples.json` 에 옮겼다(저장소 시험용 — npm 판에는 들어가지 않는다).
- 윤문 뒤 보존 대조(`lib/prose/preserve.mjs`, `docs` 묶음 `check_rewrite`) — 같은 판(c07df14)의 `scripts/checks.py`·`scripts/verify_gates.py`·`scripts/restore_modality.py`·`skills/humanize-korean/references/metrics_v2.py` 를 보고 새로 썼다.
  - 옮긴 것: 당위·추측 표지 사전(`verify_gates.py` 의 `DEONTIC_RE`·`HEDGE_RE` 갈래 — 「-아/어/여야」 앞 음절을 받침 없는 열린 음절로 좁히는 조건 포함)과 대구 표층형 식(`metrics_v2.py` `_ANTITHESIS_RE`). 표지 사전에는 법령 글 꼴(아니 된다·서는 안 된다·지 못한다 / 사료된다·볼 여지·기 어렵)을 더했다.
  - 가져온 발상: 수치·인용 보존(`checks.py` — 단 k-labor 는 수치를 주입만이 아니라 추가·삭제·변경 모두 개수까지 세고, 인용은 길이·발화 동사와 상관없이 전부 본다), 글자 변경률 30% 경고·50% 중단과 대구 전멸(원문 5개 이상 → 0개) 문턱(`verify_gates.py`·`metrics_v2.py`), 당위·추측을 총수가 아니라 짝 문장으로 보는 방식과 문자 바이그램 Dice 유사도·Needleman-Wunsch 문장 정렬(간격 −0.4)·짝 유사도 하한 0.35(`restore_modality.py`).
  - k-labor 가 새로 쓴 것: 같은 문장을 닻으로 먼저 맞추고 바뀐 덩어리 안에서만 글자 대조(Myers)·문장 정렬을 하는 실행기, `[관련 …]` 블록 불변, 노동 법령 용어 목록, 상태어·출력 방식.

```
MIT License

Copyright (c) 2026 epoko77-ai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
