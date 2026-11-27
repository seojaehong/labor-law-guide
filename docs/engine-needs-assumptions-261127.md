# 계산 도구 공통 형식 — 빠진 사실(needs)과 가정한 값(assumptions)

2026-11-27 재홍님 승인. 형식 정의 = `src/lib/calc/needs.ts`. 이 문서는 개발게이트 G1(지도)·G2(상태어)다.

## 형식

- `needs: {key, question, why}[]` — 결론(금액·지급 여부·이상/미달)을 바꾸는데 입력에 없는 사실. **needs 가 하나라도 남으면 금액은 null 이고, 참고 금액·세금·실수령도 함께 내지 않는다.**
- `assumptions: {key, value, note}[]` — 넣지 않아 기본값을 쓴 것. 금액만 바꾸고 결론은 바꾸지 않을 때만 여기 둔다. **결론을 바꾸는 기본값은 assumptions 가 아니라 needs 로 보낸다.**
- `question` 은 관찰할 수 있는 사실을 묻는다(「근로계약서나 근무표에 적힌 1주 근로시간이 몇 시간인가요?」). 법적 판단을 묻지 않는다. 금지어(`src/lib/banned.ts`)를 통과해야 한다.
- `why` 는 그 사실이 결론을 어떻게 바꾸는지와 조문.
- MCP 는 `needs`·`assumptions` 를 응답 **최상위**에 둔다. 챗봇·`/api/tools/calc` 는 결과 객체에 둔다(키 이름은 챗봇 인자 이름, 예 `weekly_hours`).

## G2 — 상태어

| 상태 | 도구 | 뜻 | 금액 | needs | 이것이 아니다 |
|---|---|---|---|---|---|
| `hours-unknown` | 퇴직금 | 계속근로 1년 이상인데 1주 소정근로시간을 모름 | null(세금·실수령 없음) | `weeklyHours`(챗봇 `weekly_hours`) | 「판정 보류 + 금액」이 아니다(261126 D2 를 뒤집음). 1년 미만이면 시간과 상관없이 `under-1y` 라 묻지 않는다 |
| `needs-input` | 주휴수당 | 개근·입사 주·퇴사 주 중 비운 것이 있음 | null | 비운 것마다 하나(`fullAttendance`·`endsBeforeWeekEnd`·`joinedMidWeek`) | 15시간 미만·퇴사 주(true)·결근(false)처럼 0원이 확실하면 그쪽이 앞선다 — 묻지 않는다 |
| `joined-unclear` | 주휴수당 | 주중 입사 — 해석이 갈림 | null | **없음**(`unresolved` 로 둔다) | needs 가 아니다. 사실을 더 물어도 풀리지 않는다(행정해석 미확인). 「확인 필요」로 멈춘다 |
| `under-1y`·`under-15h` | 퇴직금 | 지급 대상 아님 | 참고 계산액(그대로) | 없음 | needs 가 아니다 — 결론이 이미 정해졌다 |
| `ok: null` | 최저임금(챗봇) | 1주 소정근로시간을 모름 | `shortfall`·`min_monthly` null | `weekly_hours` | 종전 `|| 40` 기본값이 아니다 |
| hoursChanged 체크 | 퇴직금 | 15시간 이상·미만 사이를 오간 적 | 계산하지 않음 | 지금은 없음(범위 밖 멈춤) | 후속 — 아래 「결정 필요」 |
| `insufficient-input` | 퇴직 연차 정산 | 일수 없음 | 없음 | 아직 형식 미적용 | 후속 |
| 연차수당 `difference` | 연차수당 | 계산액 − 넣은 회사 지급액(산술 차이) | 총액은 그대로 | 없음 | 「더 지급할 돈」이 아니다. 회사 지급액 빈칸 = 대조 안 함(null), 0 = 「지급한 돈이 없다」일 때만 |

## G1 — 지도(멈춤 상태와 조용한 기본값)

조사 기준 = 이 브랜치(261127). 「결론」= 예/아니오·이상/미달·대상 여부까지 바뀌는가.

| 도구 | 경로 | 멈춤·보류(금액) | 조용한 기본값 | 결론을 바꾸나 | 이번 PR |
|---|---|---|---|---|---|
| 퇴직금 | 웹·MCP·챗봇·/api·/exit | hours-unknown·under-1y·under-15h·hoursChanged·제외임금 빈칸 오류 | 상여·연차수당·1일 통상임금 `?? 0` | 시간: 결론 / 나머지: 금액만 | **hours-unknown → needs, 금액 null** |
| 주휴수당 | 웹·MCP | needs-input·joined-unclear / under15·ended·absent = 0 | MCP `fullAttendance ?? true`·입사·퇴사 주 비움 = 평상 주 / `fullTimeDays ?? 5` | 앞 셋: 결론 / 근무일: 금액만 | **비우면 needs, fullTimeDays → assumptions** |
| 연차수당 | 웹·MCP | under5·under15h·out-of-scope = null | `fullTimeWeeklyDays ?? 5` · `promotion ?? unknown` · MCP `asOf ?? 오늘` | 금액만 | **alreadyPaid 빈칸/0 구분, 차이 문구, 단시간 근무일 → assumptions** |
| 최저임금 | 챗봇 | — | `weekly_hours || 40` · `year || 올해` | 시간: 이상/미달 / 해: 적용 고시 | **시간 → needs, 해 → assumptions** |
| 통상임금·연장수당 | 챗봇 | — | `monthly_hours` 209 · 1일 8시간 | 금액만 | **209 → assumptions** |
| 최저임금 | 웹·MCP | 오류만 | `fullTimeDays ?? 5` · 상여·복리 `?? 0` · MCP `year` → 올해+내년 | 판정도 | 후속(주휴 엔진 호출은 평상 주로 고정해 회귀를 막음) |
| 해고예고수당 | 웹·MCP | under3m·noticed = 0 | `noticed`·`noticeDate` 둘 다 없음 → 예고 안 함 → 30일분 · `fullTimeWeeklyDays/Hours ?? 5/40` | **판정도** | 후속 |
| 휴업수당 | 웹·MCP | under5·force-majeure·commission | `paidDuring`·`excludedWages`·`annualBonus ?? 0`(제외일수가 있어도 막지 않음) | 금액만(평균임금 부풂) | 후속 |
| 일할계산·결근공제 | 웹·MCP | full-month·끝수 미정 | 공휴일 `[]`·지각 0·월 209·월~금 | 금액만 | 후속 |
| 실수령액 | 웹·MCP | aboveTable | 비과세·자녀 0 · 비율 100 · 가족 1 · 날짜 오늘 | 금액만 | 후속(assumptions 만) |
| 퇴직소득세 | MCP | 2023년 전 퇴사 = 오류 | `payout ?? cash` | 원천징수 여부 | 후속 |
| 중도퇴사 정산 | 웹·MCP | out | 금액칸 0 · 직전 간이세액 0 · 해 올해 | 해: 판정도 | 후속 |
| 출근율 | 웹·MCP | under1y·none·monthly | `days ?? {}` → 넣지 않은 날은 출근 | **판정도** | 후속 |
| 임금체불 지연이자 | 웹·MCP | basis none | `lastWorkDay` 비움 → 재직 중 | **판정도**(1호/2호/0) | 후속 |
| 근로자성 점검 | 웹·MCP | unknown·notComputed | 답 없음 → unknown(안전) · 식대 0 · 가족 1 | 금액만 | 후속(낮음) |
| 통상임금 점검 | 웹·MCP | unclear | `minimum ?? 0` · `employedOnPayday` 없음 → 조건 없음 · 날짜 오늘 → 기준 선택 · 209 | **판정도** | 후속 |
| 공휴일 근로수당 | 웹·MCP | not_computed 등 | 209·8 · **`weekly_hours || 0` → 15시간 검사 건너뜀** · MCP `paidContinuously ?? true` | **판정도** | 후속(우선) |
| 상시근로자 수 | 웹·MCP | none/spans | `openDays ?? 월~금`(메모 없음) · 나머지는 메모로 드러남 | 판정도(5인) | 후속 |
| 퇴직 연차 정산 | MCP | insufficient-input | `asOf ?? 오늘` | 안전 | 후속(형식만) |
| 월급 대조 | MCP | policy 없음 → 금액 없음 | 일부 boolean 설명이 「모름 = false」 | 대부분 안전 | 후속 |

## 후속(이번 PR 에 넣지 않음 — 조각을 키우지 않는다)

결론을 바꿀 수 있는 순서:

1. ✅(교정 261127 후속 PR) 공휴일 근로수당 — `calcHolidayPayChecked`. 시급제 관공서 공휴일(또는 시급에 주휴 포함)에 주 시간 없음 → needs `weekly_hours`, 일용직 계속 근로 여부 없음 → needs `paid_continuously`, 월 209·1일 8 → assumptions. 웹은 시급제 주 시간 빈칸을 알림으로 막는다.
2. 통상임금 점검 — 기준일 `date || 오늘`(새·종전 기준 선택), `employedOnPayday` 없음 → 재직조건 없음, `minimum ?? 0`. 🔴 **설계 결정 필요** — 항목별 체크 칸이 많아 어떤 빈칸을 되묻고 어떤 빈칸을 「해당 없음」으로 볼지 정해야 한다.
3. ✅(교정 261127 후속 PR) 해고예고수당 — `noticed`·`noticeDate` 둘 다 없으면 `needs-input`(needs `noticed`, 금액 null). 3개월 미만은 묻지 않는다. 웹은 라디오라 늘 값이 있다. **바꾼 결정** — 261124 P2 #12 의 「생략 = 예고 안 함」을 뒤집음.
4. 임금체불 지연이자 — 마지막 근무일 비움 → 재직 중. 🔴 **설계 결정 필요** — 「비우면 재직 중」이 입력 계약이라 needs 로 바꾸려면 재직 여부 입력을 새로 둬야 한다(웹 화면 포함).
5. 출근율 — 넣지 않은 결근을 출근으로 봄. 🔴 **설계 결정 필요** — 달력 입력이 「표시한 날만 결근」 구조라, 기간 전체를 확인했다는 표시를 따로 받을지 정해야 한다.
6. 상시근로자 수 — `openDays ?? 월~금`(메모 없음). 퇴직소득세 `payout ?? cash`.
7. 휴업수당 — 제외일수가 있는데 제외임금 빈칸을 0 으로(퇴직금 I8 과 같은 규칙으로 맞출지).
8. 웹·MCP 최저임금 — 해·상여·복리 기본값을 assumptions 로.
9. 금액만 바꾸는 기본값(실수령액·일할계산·중도퇴사·연차 `asOf`·근로자성)을 assumptions 로 드러내기.
10. 퇴직 연차 정산 `insufficient-input`·월급 대조에 형식 적용.
