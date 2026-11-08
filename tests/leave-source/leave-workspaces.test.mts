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

import type { WorkspaceMember } from "../../src/lib/leave/leave-workspaces";

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
  W.upsertMember(ws, { name: "김영희", hireDate: "2020-01-01", terms: { duty: "홀 서비스" } });
  W.setAudience("advisor");
  const metaBlobs = [...localData.entries()]
    .filter(([k]) => !k.includes("members"))
    .map(([, v]) => v)
    .join(" ");
  assert.ok(!metaBlobs.includes("홍길동"), "목록·역할에 이름이 섞였다");
  assert.ok(!metaBlobs.includes("김영희"), "목록·역할에 이름이 섞였다");
  assert.ok(!metaBlobs.includes("홀 서비스"), "목록·역할에 계약 조건이 섞였다");
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

// ── 허용한 칸만 저장 — 사업장 카드(근로계약서 작성)가 계약 조건을 더하면서 넓어졌다 ──
const TERM_KEYS = [
  "amountMode", "breakMinutes", "duty", "end", "hourlyWage", "location",
  "monthlyTotal", "payType", "start", "weeklyRestDay", "workDays",
].sort();
/** 어디에도 저장되면 안 되는 칸 — 키 이름과 값 둘 다 본다 */
const PERSONAL = {
  rrn: "900101-1234567",
  주민번호: "900101-1234568",
  birthDate: "1990-01-01",
  address: "서울특별시 가상구 가상로 1",
  phone: "010-1234-5678",
  email: "hong@example.com",
  account: "110-123-456789",
  // 사업장 id(UUID)에 우연히 들어 있을 수 없는 값 — 「18」은 UUID 에 섞여 들어가 시험이 가끔 틀렸다
  recordedDays: 987654321,
};
function rawAll(): string {
  return [...localData.values(), ...sessionData.values()].join("\n");
}
function assertNoPersonal() {
  const raw = rawAll();
  for (const [k, v] of Object.entries(PERSONAL)) {
    assert.ok(!raw.includes(`"${k}"`), `키 ${k} 가 저장됐다`);
    assert.ok(!raw.includes(String(v)), `값 ${v} 가 저장됐다`);
  }
}

ck("허용한 칸만 저장 — 주민번호·생년월일·주소·연락처는 버린다", () => {
  const ws = W.createWorkspace("A", "client")!;
  // 호출부가 사람 정보를 섞어 넣어도(명부·계약 조건·사업장 정보 세 군데 모두)
  const dirtyTerms = { ...PERSONAL, duty: "홀 서비스", monthlyTotal: "2,600,000", workDays: ["월", "화"] };
  const dirty = { name: "홍길동", hireDate: "2019-03-02", ...PERSONAL, terms: dirtyTerms } as unknown as WorkspaceMember;
  W.setMembers(ws, [dirty]);
  W.upsertMember(ws, { ...dirty, name: "김영희" } as WorkspaceMember);
  W.updateWorkspace(ws.id, { ownerName: "김대표", fivePlus: "no", ...PERSONAL } as unknown as Parameters<typeof W.updateWorkspace>[1]);
  assertNoPersonal();
  const m = W.getMembers(ws);
  assert.equal(m.length, 2);
  assert.deepEqual(Object.keys(m[0]).sort(), ["hireDate", "name", "terms"]);
  for (const k of Object.keys(m[0].terms ?? {})) assert.ok(TERM_KEYS.includes(k), `허용하지 않은 조건 칸 ${k}`);
  assert.equal(m[0].terms?.duty, "홀 서비스");
  assert.deepEqual(Object.keys(W.listWorkspaces()[0]).sort(), ["fivePlus", "id", "kind", "name", "remember"], "대표자명이 목록(항상 localStorage)에 들어갔다");
  assert.deepEqual(W.getWorkspaceDetails(ws), { ownerName: "김대표" });
});

ck("계약 조건이 없는 사람은 terms 칸 자체가 없다 (옛 형식 그대로)", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.setMembers(ws, [{ name: "홍길동", hireDate: "2019-03-02" }]);
  assert.deepEqual(Object.keys(W.getMembers(ws)[0]).sort(), ["hireDate", "name"]);
});

ck("저장된 계약 조건이 손상돼 있으면 그 칸만 버린다", () => {
  const ws = W.createWorkspace("A", "client")!;
  sessionData.set("work-patterns.leave.members.v1:" + ws.id, JSON.stringify([
    { name: "홍길동", hireDate: "2019-03-02", terms: { start: "09:00", duty: 3, payType: "weekly", workDays: ["월", "x", 5], weeklyRestDay: "일요일", rrn: PERSONAL.rrn } },
    { name: "김영희", hireDate: "2020-01-01", terms: "깨진 값" },
  ]));
  const m = W.getMembers(ws);
  assert.deepEqual(m[0].terms, { start: "09:00", workDays: ["월"] });
  assert.ok(!("terms" in m[1]), "객체가 아닌 terms 를 그대로 돌려줬다");
});

// ── 연차 화면과 계약서 화면이 같은 명부를 쓴다 ─────────────
ck("연차 화면이 명부를 통째로 덮어써도 계약서에서 넣은 조건은 남는다", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.upsertMember(ws, { name: "홍길동", hireDate: "2019-03-02", terms: { duty: "홀 서비스", monthlyTotal: "2,600,000" } });
  W.setMembers(ws, [{ name: "홍길동", hireDate: "2019-03-02" }, { name: "김영희", hireDate: "2020-01-01" }]);
  const m = W.getMembers(ws);
  assert.deepEqual(m.find((x) => x.name === "홍길동")?.terms, { monthlyTotal: "2,600,000", duty: "홀 서비스" });
  assert.ok(!("terms" in m.find((x) => x.name === "김영희")!), "새 사람에게 조건이 붙었다");
});

ck("이름이나 입사일이 바뀐 사람은 새 사람이다 — 이전 조건을 물려받지 않는다", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.upsertMember(ws, { name: "홍길동", hireDate: "2019-03-02", terms: { duty: "홀 서비스" } });
  W.setMembers(ws, [{ name: "홍길동", hireDate: "2019-03-03" }]);
  const m = W.getMembers(ws);
  assert.ok(!("terms" in m.find((x) => x.hireDate === "2019-03-03")!), "새 사람에게 조건이 붙었다");
  assert.deepEqual(m.find((x) => x.hireDate === "2019-03-02")?.terms, { duty: "홀 서비스" }, "입력창을 고쳤다고 저장한 조건이 사라졌다");
});

ck("setMembers 가 돌려준 값과 저장소에서 다시 읽은 값이 같다 (연차 화면 「저장됨」 표시)", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.upsertMember(ws, { name: "홍길동", hireDate: "2019-03-02", terms: { duty: "홀 서비스", workDays: ["월", "화"] } });
  const expected = W.setMembers(ws, [{ name: "홍길동", hireDate: "2019-03-02" }, { name: "김영희", hireDate: "2020-01-01" }]);
  assert.equal(JSON.stringify(W.getMembers(ws)), JSON.stringify(expected));
});

ck("upsertMember — 같은 사람이면 조건을 새 값으로 바꾸고, 없으면 더한다", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.setMembers(ws, [{ name: "김영희", hireDate: "2020-01-01" }]);
  W.upsertMember(ws, { name: "홍길동", hireDate: "2019-03-02", terms: { duty: "홀 서비스", monthlyTotal: "2,600,000" } });
  const after = W.upsertMember(ws, { name: "홍길동", hireDate: "2019-03-02", terms: { duty: "주방 보조" } });
  assert.equal(after.length, 2);
  assert.deepEqual(after.find((x) => x.name === "홍길동")?.terms, { duty: "주방 보조" });
  assert.equal(JSON.stringify(W.getMembers(ws)), JSON.stringify(after));
});

ck("upsertMember — 형식이 깨진 사람은 넣지 않는다", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.upsertMember(ws, { name: "홍길동", hireDate: "언젠가" });
  W.upsertMember(ws, { name: "  ", hireDate: "2019-03-02" });
  assert.deepEqual(W.getMembers(ws), []);
});

ck("upsertMember 도 기본은 sessionStorage 에만 쓴다", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.upsertMember(ws, { name: "홍길동", hireDate: "2019-03-02", terms: { duty: "홀 서비스" } });
  assert.equal([...sessionData.keys()].filter((k) => k.includes("members")).length, 1);
  assert.equal([...localData.keys()].filter((k) => k.includes("members")).length, 0, "켜지 않았는데 브라우저에 남았다");
});

ck("기억하기를 켜고 꺼도 계약 조건이 따라간다", () => {
  const ws = W.createWorkspace("A", "client")!;
  W.upsertMember(ws, { name: "홍길동", hireDate: "2019-03-02", terms: { duty: "홀 서비스" } });
  W.setRemember(ws.id, true);
  assert.equal(W.getMembers(W.getActiveWorkspace())[0].terms?.duty, "홀 서비스");
  W.setRemember(ws.id, false);
  assert.equal(W.getMembers(W.getActiveWorkspace())[0].terms?.duty, "홀 서비스");
  assert.equal([...localData.keys()].filter((k) => k.includes("members")).length, 0);
});

// ── 사업장 정보(대표자·5명 이상) ──────────────────────────────
ck("updateWorkspace — 대표자·5명 이상 여부를 넣고, 대표자를 비우면 그 칸을 지운다", () => {
  const ws = W.createWorkspace("가나상사", "own")!;
  events.length = 0;
  W.updateWorkspace(ws.id, { ownerName: "  김대표 ", fivePlus: "no" });
  assert.ok(events.includes(W.WORKSPACES_CHANGED), "바뀐 것을 알리지 않았다");
  assert.deepEqual(W.getWorkspaceDetails(ws), { ownerName: "김대표" });
  assert.equal(W.listWorkspaces()[0].fivePlus, "no");
  W.updateWorkspace(ws.id, { ownerName: "   " });
  assert.deepEqual(W.getWorkspaceDetails(ws), {}, "빈 대표자를 남겼다");
  assert.equal([...sessionData.keys()].filter((k) => k.includes("details")).length, 0, "빈 details 키를 남겼다");
  assert.equal(W.listWorkspaces()[0].fivePlus, "no", "건드리지 않은 칸이 바뀌었다");
  W.updateWorkspace(ws.id, { fivePlus: "maybe" as "yes" });
  assert.equal(W.listWorkspaces()[0].fivePlus, "no", "모르는 값을 받았다");
});

ck("기억하기 꺼진 사업장의 대표자명은 localStorage 원문 어디에도 없다", () => {
  const ws = W.createWorkspace("가나상사", "own")!;
  W.updateWorkspace(ws.id, { ownerName: "김대표", fivePlus: "no" });
  assert.ok(![...localData.values()].join("\n").includes("김대표"), "켜지 않았는데 대표자명이 브라우저에 남는다");
  assert.ok([...sessionData.keys()].some((k) => k === "work-patterns.leave.details.v1:" + ws.id), "대표자명이 세션 details 키에 없다");
  assert.deepEqual(W.getWorkspaceDetails(ws), { ownerName: "김대표" });
});

ck("대표자명도 기억하기를 켜면 localStorage 로, 끄면 sessionStorage 로 옮겨진다", () => {
  const ws = W.createWorkspace("가나상사", "own")!;
  W.updateWorkspace(ws.id, { ownerName: "김대표" });
  W.setRemember(ws.id, true);
  assert.ok(![...sessionData.values()].join("\n").includes("김대표"), "이전 저장소(세션)에 남았다");
  assert.ok([...localData.values()].join("\n").includes("김대표"));
  assert.deepEqual(W.getWorkspaceDetails(W.getActiveWorkspace()), { ownerName: "김대표" });
  W.setRemember(ws.id, false);
  assert.ok(![...localData.values()].join("\n").includes("김대표"), "끈 뒤에도 브라우저에 남았다");
  assert.deepEqual(W.getWorkspaceDetails(W.getActiveWorkspace()), { ownerName: "김대표" });
});

ck("사업장을 지우거나 전부 지우면 두 저장소에 details 가 없다", () => {
  const details = () => [...localData.keys(), ...sessionData.keys()].filter((k) => k.includes("details"));
  const a = W.createWorkspace("A", "own", true)!;
  W.updateWorkspace(a.id, { ownerName: "김대표" });
  const b = W.createWorkspace("B", "own")!;
  W.updateWorkspace(b.id, { ownerName: "이대표" });
  W.deleteWorkspace(a.id);
  assert.deepEqual(details(), ["work-patterns.leave.details.v1:" + b.id]);
  W.setRemember(b.id, true);
  W.forgetEverything();
  assert.deepEqual(details(), []);
  assert.ok(!rawAll().includes("대표"), "대표자명이 남았다");
});

ck("사업장 선택 칸 — 없어도 읽고, 타입이 틀리면 그 사업장을 버린다", () => {
  localData.set("work-patterns.leave.workspaces.v1", JSON.stringify([
    { id: "a", name: "A", kind: "own", remember: false },
    { id: "c", name: "C", kind: "own", remember: false, fivePlus: "maybe" },
    { id: "d", name: "D", kind: "own", remember: false, fivePlus: "yes" },
  ]));
  assert.deepEqual(W.listWorkspaces().map((w) => w.id), ["a", "d"]);
});

ck("목록에 남은 옛 ownerName 칸은 읽지 않는다(이 브랜치에서만 생긴 값)", () => {
  localData.set("work-patterns.leave.workspaces.v1", JSON.stringify([
    { id: "b", name: "B", kind: "own", remember: false, ownerName: 3 },
    { id: "d", name: "D", kind: "own", remember: false, ownerName: "김대표" },
  ]));
  const list = W.listWorkspaces();
  assert.deepEqual(list.map((w) => w.id), ["b", "d"], "읽지 않을 칸 때문에 사업장을 버렸다");
  assert.deepEqual(W.getWorkspaceDetails(list[1]), {}, "목록의 옛 대표자명을 읽었다");
});

ck("이미 기억된 명부(옛 형식)가 키 그대로 읽힌다", () => {
  localData.set("work-patterns.leave.workspaces.v1", JSON.stringify([{ id: "old1", name: "가나상사", kind: "client", remember: true }]));
  localData.set("work-patterns.leave.workspace.active.v1", JSON.stringify("old1"));
  localData.set("work-patterns.leave.members.v1:old1", JSON.stringify([{ name: "홍길동", hireDate: "2019-03-02" }, { name: "김영희", hireDate: "2020-01-01" }]));
  const ws = W.getActiveWorkspace();
  assert.equal(ws?.id, "old1");
  assert.deepEqual(W.getMembers(ws), [{ name: "홍길동", hireDate: "2019-03-02" }, { name: "김영희", hireDate: "2020-01-01" }]);
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
console.log("leave-workspaces: 40건 통과 (사업장 분리·저장소 전환·덮어쓰기·개인정보 최소화·사업장 카드 계약 조건)");
