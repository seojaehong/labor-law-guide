import { REASON_LABELS, type ReasonCategory } from "@/lib/types";
import type { Kind } from "@/app/decisions/SearchResults";

export const PAGE_SIZE = 20;
export type Search = Partial<Record<"q" | "type" | "tab" | "page" | "reason" | "sort", string | string[]>>;
/** 정렬 — relevance(기본) | date(관련 상위 100건 안에서 날짜순, 261119 S4) */
export type Sort = "relevance" | "date";
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export function parse(sp: Search) {
  const q = (first(sp.q) || "").trim().slice(0, 60);
  const tab = first(sp.tab);
  const kind = first(sp.type) || (tab === "cases" ? "court" : tab);
  const type: Kind = kind === "court" ? "court" : kind === "admin" ? "admin" : "nlrc";
  const rawPage = first(sp.page) || "1";
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : NaN;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && (parsedPage - 1) * PAGE_SIZE <= 2147483647
    ? parsedPage : 1;
  const rawReason = first(sp.reason);
  const reasonProvided = sp.reason !== undefined;
  const reason = rawReason && Object.prototype.hasOwnProperty.call(REASON_LABELS, rawReason)
    ? rawReason as ReasonCategory : null;
  const sort: Sort = first(sp.sort) === "date" ? "date" : "relevance";
  return { q, type, page, reason, reasonProvided, sort, invalidCombination: reasonProvided && (!!q || type !== "nlrc") };
}

export function pageHref(q: string, type: Kind, page = 1, sort: Sort = "relevance") {
  const sp = new URLSearchParams({ q });
  if (type !== "nlrc") sp.set("type", type);
  if (page > 1) sp.set("page", String(page));
  if (sort === "date") sp.set("sort", "date");
  return `/decisions?${sp}`;
}
export const tabHref = (q: string, type: Kind, sort: Sort = "relevance") => pageHref(q, type, 1, sort);
export function categoryHref(reason: ReasonCategory, page = 1) {
  const sp = new URLSearchParams({ reason });
  if (page > 1) sp.set("page", String(page));
  return `/decisions?${sp}`;
}
