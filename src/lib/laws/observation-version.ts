// Pin the actual public inputs and matcher source; update alongside reviewed changes.
//
// 🔴 2026-10-21. PR #56 이 rules.json 을 고치면서 RULE_VERSION 을 같이 올리지 않아
//    `work-rule-observations` 의 고정 시험이 깨진 채 머지됐다. 그 PR 은 laws 계열 시험만
//    돌렸고 전체를 안 돌렸다. **데이터나 매처를 고치면 여기 두 값을 같이 올린다.**
//    값 구하는 법은 tests/unit/work-rule-observations.test.ts 의 첫 시험에 그대로 있다.
export const MATCHER_VERSION = "a83d93f9125f0eb0e42b081fe82ed92a0d2de493f457fa1f15e0ffac35789ff8";
export const RULE_VERSION = "cf6e5012a75252f9437373f95170bf84256820c642d2993add5d3ef61316ecd8";
