import Link from "next/link";
import { REASON_LABELS, RESULT_LABELS, type ReasonCategory, type DecisionResult } from "@/lib/types";
import { stripMarkdownFormatting } from "@/lib/format-holding";

/**
 * 통합 결과 행 — 노동위 판정례 · 법원 판례 · 행정해석이 같은 줄 규격을 쓴다 (2026-09-12).
 *
 * 왜 한 규격인가. 검색 진입로가 /search · /database · /cases · /sanction · /decisions 다섯이었고
 * 화면마다 결과 모양이 달랐다. 들어온 사람이 무엇을 보고 있는지 알 수 없었다.
 * 종류는 배지로 가르고 나머지 뼈대는 공유한다.
 *
 * **종류는 source 컬럼으로 못 가른다.** 실측(2026-09-12) — source='bigcase.ai' 행에
 * 서울고등법원 판결이, source='law.go.kr' 행에 노동위 부당해고 사건이 들어 있다.
 * 그건 수집 경로일 뿐이다. 표(table)가 무엇이냐로 가른다.
 */

export type Kind = "nlrc" | "court" | "admin";

// 배지 색은 토큰만 쓴다 — 생 hex 를 새로 늘리지 않는다(DESIGN.md §9 P2·P3).
// 법원은 파랑·노랑과 겹치지 않아야 해서 중성 잉크로 간다. 색을 하나 더 만들면
// §3.4 의 2액센트 체계(파랑=인터랙션 / 노랑=브랜드)가 깨진다.
const KIND_STYLE: Record<Kind, { label: string; bg: string; fg: string; border: string }> = {
  nlrc: { label: "노동위", bg: "var(--color-info-bg)", fg: "var(--color-info-ink)", border: "var(--blue-100)" },
  court: { label: "법원", bg: "var(--grey-100)", fg: "var(--grey-700)", border: "var(--grey-200)" },
  admin: { label: "행정해석", bg: "var(--brand-50)", fg: "var(--brand-700)", border: "var(--brand-200)" },
};

/** 판정 결과는 색이 아니라 말로 먼저 읽힌다. 초심유지는 승패가 아니므로 중립색이다 —
 *  초심이 인용이었다면 근로자가 이긴 것이라, 색으로 한쪽에 몰면 목록이 거짓말을 한다. */
function resultTone(v: string | null): { text: string; bg: string; fg: string } | null {
  if (!v) return null;
  const label = RESULT_LABELS[v as DecisionResult];
  if (!label) return null;
  if (v === "granted" || v === "partial")
    return { text: label, bg: "var(--color-success-bg)", fg: "var(--color-success-ink)" };
  if (v === "dismissed" || v === "rejected")
    return { text: label, bg: "var(--color-danger-bg)", fg: "var(--color-danger-ink)" };
  return { text: label, bg: "var(--grey-100)", fg: "var(--grey-700)" };
}

export interface Row {
  kind: Kind;
  href: string;
  title: string;
  caseNumber: string | null;
  date: string | null;
  tag: string | null;
  result: string | null;
}

export function ResultRow({ row }: { row: Row }) {
  const k = KIND_STYLE[row.kind];
  const res = resultTone(row.result);
  return (
    <li className="border-b py-4" style={{ borderColor: "var(--color-border)" }}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: k.bg, color: k.fg, border: `1px solid ${k.border}` }}
        >
          {k.label}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={row.href} className="block text-[15px] font-medium leading-relaxed"
                style={{ color: "var(--color-text-primary)" }}>
            {row.title}
          </Link>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]"
               style={{ color: "var(--color-text-tertiary)" }}>
            {row.caseNumber ? <span>{row.caseNumber}</span> : null}
            {row.date ? <span>{row.date}</span> : null}
            {row.tag ? <span>{row.tag}</span> : null}
          </div>
        </div>
        {res ? (
          <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold"
                style={{ backgroundColor: res.bg, color: res.fg }}>
            {res.text}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** 마스킹된 번호는 식별자로도 검색어로도 쓸모가 없으므로 내보내지 않는다. */
export function realCaseNumber(...candidates: (string | null | undefined)[]): string | null {
  for (const n of candidates) {
    if (n && !n.includes("OOO")) return n;
  }
  return null;
}

/** 제목 자리에 들어갈 한 줄. 쟁점이 있으면 쟁점이 제목보다 낫다 — 제목은 「○ ○ ○ 부당해고 구제신청」처럼
 *  비식별 처리돼 서로 구분이 안 되는 경우가 많다. */
export function headline(keyIssue: string | null, title: string | null, fallback: string, max = 200): string {
  const issue = stripMarkdownFormatting(keyIssue || "").replace(/\s+/g, " ").trim();
  if (issue.length >= 10) return issue.length > max ? issue.slice(0, max) + "…" : issue;
  const t = (title || "").replace(/\s+/g, " ").trim();
  return t || fallback;
}

export function reasonLabel(cats: string[] | null): string | null {
  const first = cats?.[0] as ReasonCategory | undefined;
  return first && REASON_LABELS[first] ? REASON_LABELS[first] : null;
}
