/**
 * 연차 도구 공통 UI — 결론 배너 · 상태 배지 · 숫자 카드 · 접힘 섹션.
 *
 * 설계 원칙 (PLAN-v2 §2)
 *   ① 결론 먼저 — 화면 맨 위에 한 줄. 과정은 아래로
 *   ② 위계 3단 — 결론 → 요약 숫자 → 근거·원장(접힘)
 *   ④ 상태는 색만으로 구분하지 않는다 — 라벨 + 기호 병기(색맹 대응)
 *   ⑥ 실패도 자리를 갖는다 — "확인 불가"가 화면에서 밀리지 않게
 *
 * 색은 이 레포 토큰만 쓴다(--accent, --accent-warm, --danger-soft …). 새 색 만들지 않음.
 */

import type { ReactNode } from "react";

/** 제우스 요구사항: 전 화면 공통 4등급. 정보가 없으면 「확인 불가」다 */
export type LeaveStatus = "match" | "diff" | "unknown" | "out-of-scope";

const STATUS_META: Record<
  LeaveStatus,
  { label: string; mark: string; cls: string }
> = {
  match: { label: "조건상 일치", mark: "=", cls: "is-match" },
  diff: { label: "차이 있음", mark: "≠", cls: "is-diff" },
  unknown: { label: "확인 불가", mark: "?", cls: "is-unknown" },
  "out-of-scope": { label: "지원 범위 밖", mark: "—", cls: "is-out" },
};

export function StatusBadge({ status }: { status: LeaveStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`lv-badge ${m.cls}`}>
      <span className="lv-badge__mark" aria-hidden="true">
        {m.mark}
      </span>
      {m.label}
    </span>
  );
}

/**
 * 결론 배너 — 화면에서 가장 먼저 읽히는 한 줄.
 * 숫자를 크게 두고, 그 아래 한 문장으로 무엇을 해야 하는지 말한다.
 */
export function ConclusionBanner({
  tone,
  headline,
  detail,
  meta,
}: {
  tone: "action" | "clear" | "unknown";
  headline: ReactNode;
  detail?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className={`lv-conclusion lv-conclusion--${tone}`}>
      <p className="lv-conclusion__headline">{headline}</p>
      {detail && <p className="lv-conclusion__detail">{detail}</p>}
      {meta && <p className="lv-conclusion__meta">{meta}</p>}
    </section>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="lv-stats">{children}</div>;
}

export function Stat({
  value,
  label,
  emphasis,
}: {
  value: ReactNode;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`lv-stat${emphasis ? " lv-stat--emphasis" : ""}`}>
      <span className="lv-stat__value">{value}</span>
      <span className="lv-stat__label">{label}</span>
    </div>
  );
}

/**
 * 접힘 섹션 — 근거·원장처럼 "필요할 때 펴는" 것.
 * JS 없이 동작하도록 details/summary 를 쓴다(서버 컴포넌트에서 그대로 렌더).
 */
export function Foldable({
  summary,
  children,
  defaultOpen,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="lv-fold" open={defaultOpen}>
      <summary className="lv-fold__summary">{summary}</summary>
      <div className="lv-fold__body">{children}</div>
    </details>
  );
}

/**
 * 미리보기 고지 — 화면 최상단 고정.
 * 실제 자료를 아직 받지 않는다는 사실을 분명히 한다(법적 안전선).
 */
export function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="lv-demo-notice" role="status">
      <strong>미리보기 화면입니다.</strong>{" "}
      {children ?? <>예시 자료로 계산 방식을 보여드립니다. 실제 직원 정보는 입력하지 마세요.</>}
    </div>
  );
}

/** 확인이 필요한 항목 — 과장 방지. 화면마다 반드시 노출한다 */
export function ScopeNote({
  title = "함께 확인이 필요한 항목",
  items,
  footer,
}: {
  title?: string;
  items: ReactNode[];
  footer?: ReactNode;
}) {
  return (
    <section className="lv-scope">
      <h2 className="lv-scope__title">{title}</h2>
      <ul className="lv-scope__list">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
      {footer && <p className="lv-scope__footer">{footer}</p>}
    </section>
  );
}

/**
 * 모바일에서 표가 카드로 무너지도록 하는 래퍼.
 * 각 td 에 data-label 을 주면 좁은 화면에서 "라벨: 값" 형태가 된다.
 */
export function ResponsiveTable({ children }: { children: ReactNode }) {
  return <div className="lv-table">{children}</div>;
}
