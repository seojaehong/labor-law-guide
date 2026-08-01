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
  ★ 실제로 밟았다(US-017): 업로드 카드에 배너와 같은 `사진은 글자를 읽어내는 동안에만 서버를 거치고`를 쓰자
  `contract-check-upload.spec.ts:22`의 정규식이 2개를 잡는다. 같은 사실을 **다른 문장**으로 쓸 것
  (현재 카드는 `사진은 판독을 위해 서버를 거치며, …`).

## 데이터 처리 문구는 문체가 아니라 **사실 주장**이다 (DESIGN.md §8.2)

이 화면은 근로계약서 사진(성명·임금·때로 주민등록번호)을 다룬다. "저장하지 않습니다"·"전송하지 않습니다"를
쓰거나 고칠 때는 **네트워크 호출을 직접 캡처해 대조**한다. 실측(2026-08-01, playwright `page.on('request')`):

| 구간 | 호출 |
|---|---|
| 4스텝 폼 입력 → `결과 보기` → `점검 결과` 렌더 | **0건** (판정은 `engine.ts`가 브라우저에서 돈다) |
| 사진 자동 입력(`PhotoUploadCard`) | `POST /api/tools/contract-check/extract` → 서버가 Anthropic API로 중계 |
| 전 라우트 공통 | GA(`analytics.google.com`·`stats.g.doubleclick.net`) — 페이지 URL·제목·`cid`만. 계약 정보는 안 실린다 |

- ★ **"호출 0건"은 폼이 실제로 결과까지 갔을 때만 의미가 있다.** 채우다 만 런은 원래 호출이 없다 —
  `점검 결과` 렌더 여부를 같이 찍어 근거로 남길 것.
- ★ **미저장(not stored) ≠ 미전송(not transmitted).** 사진을 다루는 컨트롤 옆에서 저장 여부만 말하면
  전송 사실을 감추는 문장이 된다(§8.2 규율 3). 폼 입력에 대해서는 "전송하지 않는다"가 사실이지만,
  두 주장을 한 문장으로 뭉치면 그 순간 거짓이 된다.
- ★ **`page.tsx`의 `metadata.description`·`openGraph.description`도 사용자에게 보이는 문구다.**
  화면 본문만 고치고 메타를 두면 검색결과·공유 카드로 옛 주장이 계속 나간다. 함께 grep할 것.
- 정합성의 기준선은 `src/app/privacy/page.tsx`다. 거기서 폼(전송 없음)과 사진(전송 있음·미저장)을
  **조건부로** 갈라 적는다 — 화면·메타에서 그 조건을 떼면 불일치가 된다.
