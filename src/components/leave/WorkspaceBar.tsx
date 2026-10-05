"use client";

import { useEffect, useState } from "react";

import {
  WORKSPACES_CHANGED,
  createWorkspace,
  deleteWorkspace,
  forgetEverything,
  getActiveWorkspace,
  getAudience,
  listWorkspaces,
  setActiveWorkspace,
  setAudience,
  setRemember,
} from "@/lib/leave/leave-workspaces";
import type { Audience, Workspace } from "@/lib/leave/leave-workspaces";

/**
 * 사업장 막대 — 노무사는 자문사를 여러 개, 회사 담당자는 우리 회사 하나.
 *
 * 처음 오면 역할을 한 번 묻는다. 그 값에 따라 문구와 기본 사업장 성격이 갈린다.
 * 서버로 아무것도 보내지 않는다. 저장 위치는 사업장마다 사용자가 켠다.
 */
export function WorkspaceBar() {
  const [audience, setAud] = useState<Audience | null>(null);
  const [list, setList] = useState<Workspace[]>([]);
  const [active, setActive] = useState<Workspace | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  /** 마운트 전에는 아무것도 그리지 않는다 — 저장소는 브라우저에만 있다 */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setAud(getAudience());
      setList(listWorkspaces());
      setActive(getActiveWorkspace());
      setReady(true);
    };
    sync();
    window.addEventListener(WORKSPACES_CHANGED, sync);
    return () => window.removeEventListener(WORKSPACES_CHANGED, sync);
  }, []);

  if (!ready) return null;

  // ── ① 역할을 아직 안 고름
  if (!audience) {
    return (
      <section className="lv-ws lv-ws--ask">
        <p className="lv-ws__ask">어떤 쪽으로 쓰시나요?</p>
        <div className="lv-ws__choices">
          <button type="button" onClick={() => setAudience("advisor")}>
            <strong>노무사 · 노무법인</strong>
            <span>자문사를 여러 곳 관리합니다</span>
          </button>
          <button type="button" onClick={() => setAudience("employer")}>
            <strong>우리 회사 담당자</strong>
            <span>한 사업장만 봅니다</span>
          </button>
        </div>
        <p className="lv-ws__note">
          고르신 값은 화면 구성에만 씁니다. 가입이 아니고 서버로 가지 않습니다.
        </p>
      </section>
    );
  }

  const isAdvisor = audience === "advisor";
  const label = isAdvisor ? "자문사" : "사업장";

  // ── ② 사업장이 아직 없음
  if (list.length === 0) {
    return (
      <section className="lv-ws">
        <form
          className="lv-ws__add"
          onSubmit={(e) => {
            e.preventDefault();
            if (createWorkspace(newName, isAdvisor ? "client" : "own")) setNewName("");
          }}
        >
          <label className="lv-input__field">
            <span>{isAdvisor ? "자문사 이름" : "회사 이름"}</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={isAdvisor ? "예: 가나상사" : "예: 우리회사"}
              autoComplete="off"
            />
          </label>
          <button type="submit" className="lv-input__btn" disabled={newName.trim() === ""}>
            {label} 만들기
          </button>
        </form>
        <p className="lv-ws__note">
          {isAdvisor
            ? "자문사별로 직원 명부가 따로 유지됩니다. 여러 곳을 만들어 위에서 전환하며 쓰실 수 있습니다."
            : "직원 명부를 여기에 두면 화면을 옮겨도 다시 올리지 않아도 됩니다."}
        </p>
      </section>
    );
  }

  // ── ③ 사업장이 있음
  return (
    <section className="lv-ws">
      <div className="lv-ws__row">
        <label className="lv-input__field lv-ws__pick">
          <span>{label}</span>
          <select
            value={active?.id ?? ""}
            onChange={(e) => setActiveWorkspace(e.target.value)}
          >
            {list.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        {adding ? (
          <form
            className="lv-ws__add"
            onSubmit={(e) => {
              e.preventDefault();
              if (createWorkspace(newName, isAdvisor ? "client" : "own")) {
                setNewName("");
                setAdding(false);
              }
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={isAdvisor ? "자문사 이름" : "회사 이름"}
              autoComplete="off"
              aria-label={isAdvisor ? "자문사 이름" : "회사 이름"}
            />
            <button type="submit" className="lv-input__btn" disabled={newName.trim() === ""}>
              추가
            </button>
            <button type="button" className="lv-linklike" onClick={() => setAdding(false)}>
              취소
            </button>
          </form>
        ) : (
          <button type="button" className="lv-input__btn is-ghost" onClick={() => setAdding(true)}>
            {label} 추가
          </button>
        )}
      </div>

      {active && (
        <div className="lv-ws__foot">
          <label className="lv-ws__remember">
            <input
              type="checkbox"
              checked={active.remember}
              onChange={(e) => setRemember(active.id, e.target.checked)}
            />
            이 브라우저에 「{active.name}」 명부를 기억하기
          </label>
          <span className="lv-ws__state">
            {active.remember
              ? "탭을 닫아도 이 브라우저에 남습니다 — 공용 PC 라면 끄시거나 다 쓰신 뒤 지워 주세요."
              : "탭을 닫으면 사라집니다."}
          </span>
          <button
            type="button"
            className="lv-linklike"
            onClick={() => {
              if (confirm(`「${active.name}」과 그 명부를 지웁니다. 계속할까요?`)) {
                deleteWorkspace(active.id);
              }
            }}
          >
            이 {label} 지우기
          </button>
          <button
            type="button"
            className="lv-linklike"
            onClick={() => {
              if (confirm("이 브라우저에 저장된 사업장과 명부를 전부 지웁니다. 계속할까요?")) {
                forgetEverything();
              }
            }}
          >
            전부 지우기
          </button>
        </div>
      )}
    </section>
  );
}
