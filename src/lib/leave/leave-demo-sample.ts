/**
 * 연차 대조 데모용 **가상** 직원 표본.
 *
 * 🔒 실제 개인정보가 아니다. 이름은 가상이고 입사일도 임의다.
 *    이 도구는 오늘 시점에 **외부 파일을 일절 받지 않는다** — 이 고정 표본만 읽는다.
 *
 * `recordedDays` = "회사 대장에 이렇게 적혀 있더라"를 흉내낸 값.
 *   일부러 몇 건을 틀리게 넣었다. 실무에서 실제로 자주 나오는 유형이다:
 *     · 1년 미만인데 15일을 통째로 부여
 *     · 가산연차를 매년 1일씩 올림(2년마다가 아니라)
 *     · 상한 25일을 넘겨 계산
 *     · 1년 미만 개월수 반올림 오류
 */

export interface DemoEmployeeRow {
  name: string;
  hireDate: string;
  recordedDays: number;
  /** 이 행이 무엇을 보여주려는 사례인지 — 데모 설명용 */
  note?: string;
}

/** 기준일 — 데모를 고정해 두기 위해 하드코딩한다 */
export const DEMO_AS_OF = "2026-09-23";

export const DEMO_WORKPLACE_NAME = "(가상) 한빛산업 주식회사";

export const DEMO_ROWS: DemoEmployeeRow[] = [
  {
    name: "가상직원 A",
    hireDate: "2019-03-02",
    recordedDays: 18,
    note: "근속 7년 — 15 + 가산 3",
  },
  {
    name: "가상직원 B",
    hireDate: "2026-03-16",
    recordedDays: 15,
    note: "입사 6개월인데 15일을 통째로 부여한 사례",
  },
  {
    name: "가상직원 C",
    hireDate: "2024-01-08",
    recordedDays: 16,
    note: "근속 2년 — 가산은 3년차부터인데 미리 올린 사례",
  },
  {
    name: "가상직원 D",
    hireDate: "1996-04-01",
    recordedDays: 30,
    note: "장기근속 — 상한 25일을 넘겨 계산한 사례",
  },
  {
    name: "가상직원 E",
    hireDate: "2025-11-20",
    recordedDays: 10,
    note: "1년 미만 — 개월수 계산이 1일 어긋난 사례",
  },
  {
    name: "가상직원 F",
    hireDate: "2014-07-01",
    recordedDays: 20,
    note: "근속 12년 — 15 + 가산 5",
  },
  {
    name: "가상직원 G",
    hireDate: "2026-09-01",
    recordedDays: 0,
    note: "입사 1개월 미만",
  },
  {
    name: "가상직원 H",
    hireDate: "2022-09-23",
    recordedDays: 16,
    note: "근속 4년 — 15 + 가산 1",
  },
];
