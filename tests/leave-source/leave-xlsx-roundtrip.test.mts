/**
 * 엑셀 왕복 — 서식을 **실제 xlsx 로 쓰고 다시 읽어** 계산까지 간다.
 *
 * 왜 이게 필요한가: 2026-09-23 에 내 루브릭 100점 + 테스트 69건 상태에서
 * 외부 검수가 엑셀 경로 버그를 찾았다. 테스트가 전부 계산 엔진만 보고 있었고,
 * 엑셀 읽기는 컴포넌트 안에 있어 한 줄도 닿지 않았다.
 * next build 는 컴포넌트를 컴파일하지만 **실행하지 않는다.**
 *
 * 그래서 여기서는 흉내내지 않는다. exceljs 로 진짜 파일 바이트를 만들고,
 * 그 바이트를 다시 파싱해서 사람 수·날짜·빈 칸이 그대로인지 본다.
 */
import assert from "node:assert/strict";

import { buildWorkbook } from "../../src/lib/leave/leave-xlsx";
import { LEAVE_TEMPLATE_SHEETS } from "../../src/lib/leave/leave-template-xlsx";
import { buildText, looksLikeHeader, parseLines, readGrid, cellText } from "../../src/lib/leave/leave-sheet";
import { compareRow } from "../../src/lib/leave/annual-leave";

let fail = 0;
async function ck(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`  ❌ ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

const ExcelJS = (await import("exceljs")).default;

/** 명세 → 진짜 xlsx 바이트 → 다시 읽은 표 */
async function roundTrip(sheets = LEAVE_TEMPLATE_SHEETS): Promise<string[][]> {
  const wb = await buildWorkbook(sheets);
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf as ArrayBuffer);
  const ws = back.worksheets[0];
  assert.ok(ws, "다시 읽었을 때 시트가 있어야 한다");
  return readGrid(ws);
}

/** 임의의 표를 xlsx 로 만들었다가 다시 읽는다 (헤더·서식 없이 값만) */
async function roundTripRaw(rows: (string | number | null)[][]): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("s");
  rows.forEach((r) => ws.addRow(r.map((v) => (v === null ? "" : v))));
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf as ArrayBuffer);
  return readGrid(back.worksheets[0]!);
}

await ck("빈 서식이 실제 xlsx 로 만들어지고 다시 읽힌다", async () => {
  const grid = await roundTrip();
  assert.ok(grid.length > 0, "표가 비어 있다");
});

await ck("서식을 그대로 올리면 예시 3명이 잡힌다", async () => {
  const grid = await roundTrip();
  const header = looksLikeHeader(grid);
  const text = buildText(grid, header, 0, 1, 2);
  const rows = parseLines(text).filter((r) => !r.error);
  assert.equal(rows.length, 3, `3명이어야 한다 — 실제 ${rows.length}명`);
  assert.deepEqual(rows.map((r) => r.hireDate), ["2019-03-02", "2026-03-16", "2024-01-08"]);
});

// ★ 받자마자 그대로 올려보는 것이 가장 흔한 첫 동작이다. 거기서 경고가 쏟아지면
//   "이 도구 고장났나" 로 읽힌다. 안내를 둘째 시트로 뺀 이유.
await ck("서식을 받자마자 그대로 올려도 읽지 못한 줄이 0건", async () => {
  const grid = await roundTrip();
  const text = buildText(grid, looksLikeHeader(grid), 0, 1, 2);
  const bad = parseLines(text).filter((r) => r.error);
  assert.equal(bad.length, 0, `경고 ${bad.length}건: ${bad.map((b) => b.raw).join(" / ")}`);
});

await ck("안내는 둘째 시트에 있고 첫 시트에 섞이지 않는다", async () => {
  const wb = await buildWorkbook(LEAVE_TEMPLATE_SHEETS);
  assert.equal(wb.worksheets.length, 2, "시트가 둘이어야 한다");
  assert.equal(wb.worksheets[1].name, "안내");
  const first = readGrid(wb.worksheets[0]);
  const joined = first.flat().join(" ");
  assert.ok(!joined.includes("브라우저 안에서만"), "안내가 첫 시트에 섞였다");
});

await ck("서식의 제목·안내 줄이 직원으로 잡히지 않는다", async () => {
  const grid = await roundTrip();
  const text = buildText(grid, looksLikeHeader(grid), 0, 1, 2);
  const rows = parseLines(text);
  const names = rows.filter((r) => !r.error).map((r) => r.name);
  for (const bad of ["연차 대장", "이름", "·"]) {
    assert.ok(!names.some((n) => n.includes(bad)), `"${bad}" 가 직원으로 잡혔다: ${names.join(", ")}`);
  }
});

await ck("빈 대장값은 null 로 남는다 (0 이 되지 않는다)", async () => {
  const grid = await roundTrip();
  const text = buildText(grid, looksLikeHeader(grid), 0, 1, 2);
  const rows = parseLines(text).filter((r) => !r.error);
  const park = rows.find((r) => r.name.includes("박철수"));
  assert.ok(park, "박철수 줄이 있어야 한다");
  assert.equal(park.recordedDays, null, "빈 칸이 0 으로 둔갑하면 안 된다");
});

await ck("서식으로 계산한 값이 근로기준법 제60조와 맞는다", async () => {
  const grid = await roundTrip();
  const text = buildText(grid, looksLikeHeader(grid), 0, 1, 2);
  const rows = parseLines(text).filter((r) => !r.error);
  const hong = rows.find((r) => r.name.includes("홍길동"))!;
  const r = compareRow(
    { name: hong.name, hireDate: hong.hireDate, recordedDays: hong.recordedDays ?? 0 },
    "2026-09-24"
  );
  // 2019-03-02 입사 → 2026-09-24 기준 7년차: 15 + floor((7-1)/2) = 18
  assert.equal(r.calculatedDays, 18, `18일이어야 한다 — 실제 ${r.calculatedDays}일`);
  assert.equal(r.verdict, "match", "서식 예시값 18 과 일치해야 한다");
});

// ── 여기서부터는 사용자가 실제로 올리는 **남의 엑셀**
await ck("중간 열이 비어도 열 위치가 밀리지 않는다", async () => {
  // 이름 / (빈 부서) / 입사일 — 셋째 열이 둘째로 올라오면 안 된다
  const grid = await roundTripRaw([
    ["이름", "부서", "입사일"],
    ["홍길동", "", "2019-03-02"],
  ]);
  assert.equal(grid[1].length, 3, `열 수가 3이어야 한다 — 실제 ${grid[1].length}: ${grid[1].join("|")}`);
  assert.equal(grid[1][1], "", "빈 칸이 자리를 지켜야 한다");
  assert.equal(grid[1][2], "2019-03-02");
  // 열 매핑으로 이름=0, 입사일=2 를 지정하면 정상 파싱
  const rows = parseLines(buildText(grid, true, 0, 2, null));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hireDate, "2019-03-02");
});

await ck("열 이름이 달라도 매핑으로 읽힌다", async () => {
  const grid = await roundTripRaw([
    ["사원명", "입사연월일", "연차일수"],
    ["김영희", "2024.1.8", 16],
  ]);
  const rows = parseLines(buildText(grid, looksLikeHeader(grid), 0, 1, 2)).filter((r) => !r.error);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hireDate, "2024-01-08", "2024.1.8 형식을 읽어야 한다");
  assert.equal(rows[0].recordedDays, 16);
});

await ck("엑셀 날짜 셀(Date)이 UTC 날짜로 읽힌다", async () => {
  // 엑셀에서 날짜 서식으로 넣으면 문자열이 아니라 Date 로 들어온다
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("s");
  ws.addRow(["이름", "입사일"]);
  const row = ws.addRow(["홍길동", null]);
  row.getCell(2).value = new Date(Date.UTC(2019, 2, 2)); // Excel 날짜 직렬값의 UTC 2019-03-02
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf as ArrayBuffer);
  const grid = readGrid(back.worksheets[0]!);
  const rows = parseLines(buildText(grid, looksLikeHeader(grid), 0, 1, null)).filter((r) => !r.error);
  assert.equal(rows.length, 1, "날짜 셀을 못 읽었다");
  assert.equal(rows[0].hireDate, "2019-03-02", "어느 시간대에서도 Excel 날짜를 유지한다");
});

await ck("제목줄이 없는 파일도 첫 사람을 잃지 않는다", async () => {
  const grid = await roundTripRaw([
    ["홍길동", "2019-03-02", 18],
    ["김영희", "2024-01-08", 16],
  ]);
  assert.equal(looksLikeHeader(grid), false, "제목줄이 없으면 false 여야 한다");
  const rows = parseLines(buildText(grid, false, 0, 1, 2)).filter((r) => !r.error);
  assert.equal(rows.length, 2, "첫 사람이 제목으로 잘리면 안 된다");
});

await ck("첫 직원의 날짜 오타가 그 사람만 문제로 남고 제목 오판을 만들지 않는다", async () => {
  const grid = await roundTripRaw([
    ["홍길동", "이십십구년", 18], // 오타
    ["김영희", "2024-01-08", 16],
  ]);
  assert.equal(looksLikeHeader(grid), false, "명시적인 제목 없이 직원을 제외하지 않는다");
  const rows = parseLines(buildText(grid, false, 0, 1, 2));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "홍길동");
  assert.ok(rows[0].error, "첫 직원은 행 오류로 남긴다");
  assert.equal(rows[1].name, "김영희");
});

await ck("빈 줄과 완전히 빈 시트를 구분한다", async () => {
  const grid = await roundTripRaw([
    ["홍길동", "2019-03-02"],
    ["", ""],
    ["김영희", "2024-01-08"],
  ]);
  assert.equal(grid.length, 2, "빈 줄은 버려야 한다");
  const empty = await roundTripRaw([["", ""]]);
  assert.equal(empty.length, 0, "전부 빈 시트는 0행");
});

await ck("수식 셀은 계산값으로 읽는다", () => {
  assert.equal(cellText({ formula: "A1&\"\"", result: "2019-03-02" }), "2019-03-02");
  assert.equal(cellText({ richText: [{ text: "홍" }, { text: "길동" }] }), "홍길동");
});

await ck("'미확인' 같은 글자는 0 이 아니라 원문으로 남는다", async () => {
  const grid = await roundTripRaw([
    ["이름", "입사일", "연차"],
    ["홍길동", "2019-03-02", "미확인"],
  ]);
  const rows = parseLines(buildText(grid, true, 0, 1, 2)).filter((r) => !r.error);
  assert.equal(rows[0].recordedDays, null, "0 으로 바뀌면 안 된다");
  assert.equal(rows[0].recordedRaw, "미확인");
});

if (fail) { console.error(`\nleave-xlsx-roundtrip: 실패 ${fail}건`); throw new Error("Original regression assertions failed"); }
console.log("leave-xlsx-roundtrip: 16건 통과 (실제 xlsx 바이트 왕복 — 서식·열밀림·날짜셀·빈칸)");
