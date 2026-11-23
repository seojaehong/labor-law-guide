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
