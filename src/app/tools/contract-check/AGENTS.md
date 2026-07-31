# /tools/contract-check 지식

## 파일 역할
- `page.tsx` — 서버 컴포넌트(metadata·canonical·OG). `ContractCheckClient.tsx` — 스텝 UI·결과 화면.
- `formState.ts` — **순수 TS**(FormState·INITIAL·CLAUSE_ITEMS·buildContract). 컴포넌트에서 분리해 둔 이유는 unit 테스트가 tsx를 import 하지 않게 하기 위함이다. 폼 필드를 추가하면 여기부터 고친다.
- `extractMap.ts` — 사진 추출 응답 → FormState 역매핑(순수). `PhotoUploadCard.tsx` — 업로드·압축·fetch.

## 함정
- ★ **buildContract의 역함수는 대칭이 아니다.** 금액은 top-level이 아니라 `wage.items[].code`(BASE·OT_WEEKDAY·HOLIDAY_EXTRA·ANNUAL_LEAVE)로 오가고, 폼에 칸이 없는 코드(MEAL·BONUS·NIGHT·OT_WEEKEND·OTHER)는 버려진다. `breaks[]`는 폼에서 합계 한 칸. 필드를 늘리면 `extractMap.ts`도 같이 고쳐야 조용히 값이 사라지지 않는다.
- ★ **`<input type="date|time">`은 `YYYY-MM-DD`·`HH:MM`이 아니면 소리 없이 빈칸이 된다.** 추출 API는 형식을 보장하지 않으므로 `normalizeDate`/`normalizeTime`을 반드시 통과시키고, 실패한 값은 "채워짐"으로 세지 말 것(하이라이트 대상이어야 한다).
- ★ **Vercel 서버리스는 요청 본문 ~4.5MB를 핸들러 진입 전에 잘라낸다** — 서버의 5MB/장 상한보다 낮다. `PhotoUploadCard`가 canvas로 합계 3.5MB 아래로 줄여 보내고, `resp.json()` 실패(비 JSON 응답)를 catch 해 한국어 안내로 폴백한다. 업로드 경로를 만질 때 이 두 방어를 없애지 말 것.
- 수습은 `applied===true`일 때만 months/wage_rate_pct를 채운다 — 아니면 MINWAGE-PROBATION 오탐.
- 지급방법은 폐쇄 선택지(계좌이체·현금)라 추출 자유문구를 키워드로 맞춘다. 못 맞추면 비우고 warnings로 알린다(임의로 raw 문자열을 넣으면 선택 없음 상태인데 값은 있는 UI가 된다).
- 개인정보 고지는 **한 군데**(ContractCheckClient 상단 배너)에만 둔다. 문구를 복제하면 e2e strict mode에서 이중 매칭이 난다.
