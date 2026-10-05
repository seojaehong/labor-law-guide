/**
 * 사업장 — 저장 위치와 명부 규칙.
 *
 * `leave-roster` 를 대체한다. 그쪽 테스트가 붙들고 있던 성질을 전부 옮겨 왔다:
 *   덮어쓰기 · 타이핑 중간 상태 누적 방지 · 손상 내구성 · 개인정보 최소화 · 서버 전송 금지
 * 여기에 사업장 고유의 것을 더한다:
 *   사업장별 분리 · 「기억하기」 전환 시 저장소 이동 · 삭제 시 양쪽 저장소 정리
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── 두 저장소를 따로 흉내낸다. 어디에 쓰였는지 구분하는 것이 이 테스트의 핵심이다.
const localData = new Map<string, string>();
const sessionData = new Map<string, string>();
const events: string[] = [];
function fakeStorage(m: Map<string, string>) {
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
(globalThis as Record<string, unknown>).window = {
  localStorage: fakeStorage(localData),
  sessionStorage: fakeStorage(sessionData),
  dispatchEvent: (e: { type: string }) => void events.push(e.type),
};
(globalThis as Record<string, unknown>).Event = class {
  type: string;
  constructor(t: string) { this.type = t; }
};

const W = await import("../../src/lib/leave/leave-workspaces");

let fail = 0;
function ck(name: string, fn: () => void) {
  localData.clear();
  sessionData.clear();
  events.length = 0;
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e) { fail += 1; console.error(`  ❌ ${name}: ${e instanceof Error ? e.message : e}`); }
}

const MEMBERS = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `사람${i}`, hireDate: "2020-01-01" }));

// ── 사업장 만들기·고르기 ────────────────────────────────────
ck("사업장이 없으면 빈 목록이고 활성도 없다", () => {
  assert.deepEqual(W.listWorkspaces(), []);
  assert.equal(W.getActiveWorkspace(), null);
});

ck("만들면 그것이 활성이 된다", () => {
  const ws = W.createWorkspace("가나상사", "client");
  assert.ok(ws);
  assert.equal(W.getActiveWorkspace()?.id, ws.id);
  assert.equal(W.getActiveWorkspace()?.kind, "client");
});

ck("이름이 빈 사업장은 만들지 않는다", () => {
  assert.equal(W.createWorkspace("   ", "client"), null);
  assert.deepEqual(W.listWorkspaces(), []);
});

ck("자문사 여러 개를 오갈 수 있다", () => {
  const a = W.createWorkspace("A상사", "client")!;
  const b = W.createWorkspace("B물산", "client")!;
  assert.equal(W.getActiveWorkspace()?.id, b.id, "새로 만든 것이 활성");
  W.setActiveWorkspace(a.id);
  assert.equal(W.getActiveWorkspace()?.name, "A상사");
  assert.equal(W.listWorkspaces().length, 2);
});

ck("없는 사업장으로는 전환되지 않는다", () => {
  const a = W.createWorkspace("A상사", "client")!;
  W.setActiveWorkspace("없는id");
  assert.equal(W.getActiveWorkspace()?.id, a.id);
});

ck("이름을 바꿀 수 있고 빈 이름으로는 안 바뀐다", () => {
  const a = W.createWorkspace("A상사", "client")!;
  W.renameWorkspace(a.id, "가나상사");
  assert.equal(W.getActiveWorkspace()?.name, "가나상사");
  W.renameWorkspace(a.id, "  ");
  assert.equal(W.getActiveWorkspace()?.name, "가나상사");
});

// ── 저장 위치 — 이 도구의 개인정보 설계 ─────────────────────
ck("기본은 기억하지 않는다 — 명부가 sessionStorage 에만 있다", () => {
  const ws = W.createWorkspace("가나상사", "client")!;
  assert.equal(ws.remember, false);
  W.setMembers(ws, MEMBERS(2));
  const inSession = [...sessionData.keys()].filter((k) => k.includes("members"));
  const inLocal = [...localData.keys()].filter((k) => k.includes("members"));
  assert.equal(inSession.length, 1, "세션에 있어야 한다");
  assert.equal(inLocal.length, 0, "켜지 않았는데 브라우저에 남으면 안 된다");
});

ck("기억하기를 켜면 명부가 localStorage 로 옮겨지고 세션에서 지워진다", () => {
  const ws = W.createWorkspace("가나상사", "client")!;
  W.setMembers(ws, MEMBERS(2));
  W.setRemember(ws.id, true);
  assert.equal([...sessionData.keys()].filter((k) => k.includes("members")).length, 0, "이전 저장소에 남았다");
  assert.equal([...localData.keys()].filter((k) => k.includes("members")).length, 1);
  assert.equal(W.getMembers(W.getActiveWorkspace()).length, 2, "옮기면서 내용을 잃었다");
});

ck("기억하기를 끄면 다시 세션으로 돌아오고 브라우저에서 지워진다", () => {
  const ws = W.createWorkspace("가나상사", "client", true)!;
  W.setMembers(ws, MEMBERS(3));
  W.setRemember(ws.id, false);
  assert.equal([...localData.keys()].filter((k) => k.includes("members")).length, 0, "브라우저에 남았다");
  assert.equal(W.getMembers(W.getActiveWorkspace()).length, 3);
});

ck("사업장 목록·역할에는 사람 정보가 없다", () => {
  const ws = W.createWorkspace("가나상사", "client")!;
  W.setMembers(ws, [{ name: "홍길동", hireDate: "2019-03-02" }]);
  W.setAudience("advisor");
  const metaBlobs = [...localData.entries()]
    .filter(([k]) => !k.includes("members"))
    .map(([, v]) => v)
    .join(" ");
  assert.ok(!metaBlobs.includes("홍길동"), "목록·역할에 이름이 섞였다");
});

// ── 명부 규칙 (leave-roster 에서 옮겨 온 것) ────────────────
ck("쓰기는 덮어쓰기다 — 앞의 목록이 남지 않는다", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.setMembers(ws, [{ name: "A", hireDate: "2020-01-01" }]);
  W.setMembers(ws, [{ name: "B", hireDate: "2021-01-01" }]);
  assert.deepEqual(W.getMembers(ws).map((m) => m.name), ["B"]);
});

ck("타이핑 중간 상태가 쌓이지 않는다 (홍 → 홍길 → 홍길동)", () => {
  const ws = W.createWorkspace("A", "client")!;
  for (const name of ["홍", "홍길", "홍길동"]) {
    W.setMembers(ws, [{ name, hireDate: "2019-03-02" }]);
  }
  const m = W.getMembers(ws);
  assert.equal(m.length, 1, `중간 상태가 남았다: ${m.map(W.memberKey).join(" / ")}`);
  assert.equal(m[0].name, "홍길동");
});

ck("같은 사람이 두 줄이면 하나로, 동명이인은 입사일로 갈린다", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.setMembers(ws, [
    { name: "홍길동", hireDate: "2019-03-02" },
    { name: "홍길동", hireDate: "2019-03-02" },
    { name: "김영희", hireDate: "2019-03-02" },
    { name: "김영희", hireDate: "2024-01-08" },
  ]);
  assert.equal(W.getMembers(ws).length, 3);
});

ck("형식이 깨진 것은 버린다", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.setMembers(ws, [
    { name: "X", hireDate: "몰라요" },
    { name: "  ", hireDate: "2020-01-01" },
    // @ts-expect-error 의도적으로 잘못된 입력
    { name: 1, hireDate: "2020-01-01" },
  ]);
  assert.deepEqual(W.getMembers(ws), []);
});

ck("이름과 입사일만 저장한다 (호출부가 더 넣어도)", () => {
  const ws = W.createWorkspace("A", "client")!;
  // @ts-expect-error 의도적으로 여분 필드
  W.setMembers(ws, [{ name: "홍길동", hireDate: "2019-03-02", recordedDays: 18, 주민번호: "900101-1234567" }]);
  assert.deepEqual(Object.keys(W.getMembers(ws)[0]).sort(), ["hireDate", "name"]);
});

ck("저장된 값이 손상돼 있어도 터지지 않는다", () => {
  const ws = W.createWorkspace("A", "client")!;
  sessionData.set("work-patterns.leave.members.v1:" + ws.id, "{{깨진 JSON");
  assert.deepEqual(W.getMembers(ws), []);
  localData.set("work-patterns.leave.workspaces.v1", "[[[");
  assert.deepEqual(W.listWorkspaces(), []);
});

ck("사업장마다 명부가 따로다", () => {
  const a = W.createWorkspace("A상사", "client")!;
  W.setMembers(a, [{ name: "가", hireDate: "2020-01-01" }]);
  const b = W.createWorkspace("B물산", "client")!;
  W.setMembers(b, [{ name: "나", hireDate: "2021-01-01" }, { name: "다", hireDate: "2022-01-01" }]);
  assert.equal(W.getMembers(a).length, 1);
  assert.equal(W.getMembers(b).length, 2);
  assert.deepEqual(W.getMembers(a).map((m) => m.name), ["가"]);
});

// ── 지우기 ───────────────────────────────────────────────────
ck("사업장을 지우면 명부도 양쪽 저장소에서 사라진다", () => {
  const a = W.createWorkspace("A상사", "client", true)!;
  W.setMembers(a, MEMBERS(2));
  W.deleteWorkspace(a.id);
  assert.deepEqual(W.listWorkspaces(), []);
  assert.equal([...localData.keys()].filter((k) => k.includes("members")).length, 0);
  assert.equal([...sessionData.keys()].filter((k) => k.includes("members")).length, 0);
});

ck("활성 사업장을 지우면 남은 것으로 넘어간다", () => {
  const a = W.createWorkspace("A", "client")!;
  const b = W.createWorkspace("B", "client")!;
  W.setActiveWorkspace(b.id);
  W.deleteWorkspace(b.id);
  assert.equal(W.getActiveWorkspace()?.id, a.id);
});

ck("전부 지우기 — 목록·역할·명부가 모두 사라진다 (공용 PC 비상 버튼)", () => {
  const a = W.createWorkspace("A", "client", true)!;
  W.setMembers(a, MEMBERS(2));
  W.setAudience("advisor");
  W.forgetEverything();
  assert.deepEqual(W.listWorkspaces(), []);
  assert.equal(W.getAudience(), null);
  assert.equal([...localData.keys()].filter((k) => k.includes("members")).length, 0);
  assert.equal([...sessionData.keys()].filter((k) => k.includes("members")).length, 0);
});

// ── 역할 ─────────────────────────────────────────────────────
ck("역할은 두 값만 받는다", () => {
  assert.equal(W.getAudience(), null);
  W.setAudience("advisor");
  assert.equal(W.getAudience(), "advisor");
  localData.set("work-patterns.leave.audience.v1", JSON.stringify("사장님"));
  assert.equal(W.getAudience(), null, "모르는 값은 null 로 본다");
});

ck("바뀔 때 같은 탭에 알린다", () => {
  W.createWorkspace("A", "client");
  assert.ok(events.includes(W.WORKSPACES_CHANGED));
});

// ── 소스 가드 ────────────────────────────────────────────────
ck("서버 전송 코드가 없다", () => {
  const src = readFileSync(new URL("../../src/lib/leave/leave-workspaces.ts", import.meta.url), "utf-8");
  for (const banned of ["fetch(", "XMLHttpRequest", "navigator.sendBeacon", "WebSocket"]) {
    assert.ok(!src.includes(banned), `${banned} — 직원정보가 밖으로 나가는 경로가 생겼다`);
  }
});

ck("명부를 localStorage 에 쓰는 것은 remember 를 거쳐야만 가능하다", () => {
  const src = readFileSync(new URL("../../src/lib/leave/leave-workspaces.ts", import.meta.url), "utf-8");
  assert.ok(
    src.includes("return ws.remember ? local() : session();"),
    "명부 저장소 선택이 remember 한 줄에 모여 있어야 한다"
  );
});

if (fail) { console.error(`\nleave-workspaces: 실패 ${fail}건`); throw new Error("Original regression assertions failed"); }
console.log("leave-workspaces: 24건 통과 (사업장 분리·저장소 전환·덮어쓰기·개인정보 최소화)");
