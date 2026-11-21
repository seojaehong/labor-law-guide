"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { Copy, Download, FileText, ListChecks, Quote } from "lucide-react";
import { Button } from "@/components/decisions-ui/button";
import { Checkbox } from "@/components/decisions-ui/checkbox";
import { copyRich, download } from "@/lib/laws/format";
import {
  blockLabel,
  buildCitationText,
  buildFullText,
  buildSelectedText,
  buildSummaryText,
  collectNodeText,
  combineSummaries,
  exportFileName,
  splitExportBlocks,
  toJsonl,
  toMarkdown,
  type ExportBlock,
  type ExportClip,
  type ExportMeta,
  type RoledExportBlock,
} from "@/lib/decision-export";
import { trimBlankLines } from "@/lib/judgment-reason";

// 본문을 prop 으로 다시 싣지 않는다(페이지 크기 2배). 서버가 그린 화면의 data-export 표지에서 클릭 시점에 모은다.
//   data-export="section" | "summary" | "section summary"
//   data-export-title="주문" · data-export-ai="true|false" · data-export-kind="head"
//   data-export-verbatim — 글자 하나만 든 원문 상자. 공용 정리 없이 앞뒤 빈 줄만 떼고 그대로 모은다(판결문 원문 요지)

type PickItem = { key: string; label: string; isAi: boolean; checked: boolean; role: "meta" | "section" | "summary"; block?: ExportBlock };

const CITATION_PREFIX: Record<ExportMeta["kind"], string> = {
  court: "[관련 판결]",
  nlrc: "[관련 판정]",
  interpretation: "[관련 행정해석]",
};

function readBlocks(): RoledExportBlock[] {
  const blocks: RoledExportBlock[] = [];
  document.querySelectorAll<HTMLElement>("[data-export]").forEach((el) => {
    const roles = (el.dataset.export ?? "").split(/\s+/).filter((role) => role === "section" || role === "summary");
    if (roles.length === 0) return;
    const text = el.dataset.exportVerbatim !== undefined ? trimBlankLines(el.textContent ?? "") : collectNodeText(el);
    if (!text) return;
    blocks.push({
      title: el.dataset.exportTitle ?? "",
      text,
      isAi: el.dataset.exportAi === "true",
      head: el.dataset.exportKind === "head",
      roles,
    });
  });
  return blocks;
}

function rangeClip(range: Range): ExportClip {
  return {
    intersects: (node) => range.intersectsNode(node as Node),
    textRange: (node) => [
      node === range.startContainer ? range.startOffset : 0,
      node === range.endContainer ? range.endOffset : (node.nodeValue ?? "").length,
    ],
    coversStart: (node) => {
      const position = range.comparePoint(node as Node, 0);
      if (position !== -1) return position === 0;
      // 선택이 항목 안에서 시작했어도 그 앞에 글자가 없으면 항목 첫머리부터 고른 것이다.
      const before = document.createRange();
      before.setStart(node as Node, 0);
      before.setEnd(range.startContainer, range.startOffset);
      return before.toString().trim() === "";
    },
  };
}

/**
 * 드래그한 글자 — 본문 표지(data-export) 안쪽 글자만 모은다. 표지 사이의 제목·배지·바로가기·안내 글자는 버린다.
 * 화면에 그려지지 않은 표지(닫힌 펼침 안 등)와 다른 표지 안에 든 표지는 건너뛴다.
 * 크로미엄은 닫힌 <details> 안 상자에도 getClientRects 를 돌려주므로 닫힌 펼침은 따로 거른다.
 */
function readSelection(): { text: string; containsAi: boolean } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const regions = Array.from(document.querySelectorAll<HTMLElement>("[data-export]")).filter(
    (el) => !el.parentElement?.closest("[data-export]") && !el.closest("details:not([open])") && el.getClientRects().length > 0,
  );
  const parts: string[] = [];
  let containsAi = false;
  for (let index = 0; index < selection.rangeCount; index++) {
    const range = selection.getRangeAt(index);
    const clip = rangeClip(range);
    for (const el of regions) {
      if (!range.intersectsNode(el)) continue;
      const text = collectNodeText(el, clip);
      if (!text) continue;
      parts.push(text);
      if (el.dataset.exportAi === "true") containsAi = true;
    }
  }
  return parts.length > 0 ? { text: parts.join("\n\n"), containsAi } : null;
}

async function writeClipboard(text: string): Promise<boolean> {
  if (await copyRich(text)) return true;
  const area = document.createElement("textarea");
  try {
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export default function DecisionExportBar({
  meta,
  hasSections,
  hasSummary,
  summaryUnavailableReason,
}: {
  meta: ExportMeta;
  hasSections: boolean;
  hasSummary: boolean;
  /** 요지 복사를 쓸 수 없을 때 그 까닭(단추의 title·설명으로 붙인다) */
  summaryUnavailableReason?: string;
}) {
  const panelId = useId();
  const summaryReasonId = useId();
  const summaryReason = !hasSummary && summaryUnavailableReason ? summaryUnavailableReason : null;
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [picker, setPicker] = useState<PickItem[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelection = useRef<{ text: string; containsAi: boolean } | null>(null);
  const hasAny = hasSections || hasSummary;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const notify = (text: string, ok = true) => {
    setToast({ text, ok });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2800);
  };

  const copy = async (text: string, done: string) => {
    const ok = await writeClipboard(text);
    notify(ok ? done : "복사하지 못했습니다. 본문을 직접 선택해 복사하세요.", ok);
  };

  const copyFull = () => {
    const { sections } = splitExportBlocks(readBlocks());
    if (sections.length === 0) return notify("복사할 본문이 없습니다.", false);
    void copy(buildFullText(meta, sections), "전문을 복사했습니다.");
  };

  const copySummary = () => {
    const { summary } = splitExportBlocks(readBlocks());
    if (!summary) return notify("복사할 요지가 없습니다.", false);
    void copy(buildSummaryText(meta, summary), summary.isAi ? "요지를 복사했습니다. AI 정리 표시가 붙어 있습니다." : "요지를 복사했습니다.");
  };

  // 지금 선택을 먼저 본다. 누르는 순간 선택이 풀리는 브라우저를 위해 pointerdown 때 잡아 둔 선택은
  // 포인터로 누른 클릭(detail > 0)에서만 대신 쓴다 — 키보드로 누를 때 옛 선택이 나가지 않게.
  const copyCitation = (event: MouseEvent<HTMLButtonElement>) => {
    const picked = readSelection() ?? (event.detail > 0 ? pendingSelection.current : null);
    pendingSelection.current = null;
    const text = picked ? buildCitationText(meta, picked.text, picked.containsAi) : null;
    if (!picked || !text) return notify("본문에서 인용할 부분을 먼저 드래그하세요.", false);
    void copy(text, picked.containsAi ? "인용 형식으로 복사했습니다. AI 정리 부분이 섞여 표시를 붙였습니다." : "인용 형식으로 복사했습니다.");
  };

  const togglePicker = () => {
    if (picker) return setPicker(null);
    const blocks = readBlocks();
    const items: PickItem[] = [{ key: "meta", label: "사건 정보", isAi: false, checked: true, role: "meta" }];
    blocks.forEach((block, index) => {
      const role = block.roles.includes("section") ? "section" : "summary";
      items.push({ key: `${role}-${index}`, label: blockLabel(block), isAi: block.isAi, checked: true, role, block });
    });
    setPicker(items);
  };

  const copyPicked = () => {
    if (!picker) return;
    const chosen = picker.filter((item) => item.checked);
    const blocks = chosen.filter((item) => item.role === "section" && item.block).map((item) => item.block as ExportBlock);
    const summary = combineSummaries(chosen.filter((item) => item.role === "summary" && item.block).map((item) => item.block as ExportBlock));
    const text = buildSelectedText(meta, { includeMeta: chosen.some((item) => item.role === "meta"), blocks, summary });
    if (!text) return notify("복사할 부분을 하나 이상 고르세요.", false);
    void copy(text, "고른 부분을 복사했습니다.");
  };

  const save = (ext: "md" | "jsonl") => {
    const { sections, summary, summaryOnly } = splitExportBlocks(readBlocks());
    if (sections.length === 0 && !summary) return notify("내려받을 내용이 없습니다.", false);
    const name = exportFileName(meta, ext);
    try {
      if (ext === "md") download(name, toMarkdown(meta, sections, summaryOnly, new Date()), "text/markdown;charset=utf-8");
      else download(name, toJsonl(meta, sections, summary), "application/x-ndjson;charset=utf-8");
      notify(`${name} 파일을 내려받습니다.`);
    } catch {
      notify("파일을 만들지 못했습니다.", false);
    }
  };

  return (
    <div className="mb-6 min-w-0" data-export-skip="">
      <div
        role="toolbar"
        aria-label="복사·내려받기"
        className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-muted/30 p-2"
      >
        <Button type="button" variant="outline" size="sm" onClick={copyFull} disabled={!hasSections}>
          <Copy aria-hidden="true" />
          전문 복사
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copySummary}
          disabled={!hasSummary}
          title={summaryReason ?? undefined}
          aria-describedby={summaryReason ? summaryReasonId : undefined}
        >
          <FileText aria-hidden="true" />
          요지 복사
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onPointerDown={() => {
            pendingSelection.current = readSelection();
          }}
          onPointerCancel={() => {
            pendingSelection.current = null;
          }}
          onPointerLeave={(event) => {
            // 누른 채 버튼 밖으로 끌고 나간 때만 버린다 — 터치는 손을 뗀 뒤(click 앞)에도 pointerleave 가 온다.
            if (event.buttons > 0) pendingSelection.current = null;
          }}
          onClick={copyCitation}
        >
          <Quote aria-hidden="true" />
          인용 형식 복사
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={togglePicker}
          disabled={!hasAny}
          aria-expanded={picker !== null}
          aria-controls={picker ? panelId : undefined}
        >
          <ListChecks aria-hidden="true" />
          선택 복사
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => save("md")} disabled={!hasAny}>
          <Download aria-hidden="true" />
          .md 내려받기
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => save("jsonl")} disabled={!hasAny}>
          <Download aria-hidden="true" />
          .jsonl 내려받기
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        인용 형식 복사는 본문에서 드래그한 글자 앞에 「{CITATION_PREFIX[meta.kind]} …」 머리줄을 붙입니다.
      </p>
      {summaryReason ? (
        <p id={summaryReasonId} className="mt-0.5 text-xs text-muted-foreground">
          요지 복사: {summaryReason}
        </p>
      ) : null}

      {picker ? (
        <div
          id={panelId}
          role="group"
          aria-label="복사할 부분 고르기"
          className="mt-2 rounded-xl border bg-background p-3"
          onKeyDown={(event) => {
            if (event.key === "Escape") setPicker(null);
          }}
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {picker.map((item, index) => (
              <li key={item.key} className="min-w-0">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={item.checked}
                    onCheckedChange={(checked) =>
                      setPicker((items) => items && items.map((it, i) => (i === index ? { ...it, checked } : it)))
                    }
                  />
                  <span className="min-w-0 break-words">
                    {item.label}
                    {item.role === "summary" ? <span className="ml-1.5 rounded bg-muted px-1 py-px text-[11px] text-muted-foreground">요지</span> : null}
                    {item.isAi ? <span className="ml-1 rounded bg-muted px-1 py-px text-[11px] text-muted-foreground">AI 정리</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={copyPicked} disabled={!picker.some((item) => item.checked)}>
              고른 부분 복사
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPicker(null)}>
              닫기
            </Button>
          </div>
        </div>
      ) : null}

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast ? (
          <div
            className={
              toast.ok
                ? "max-w-full rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg"
                : "max-w-full rounded-lg border border-destructive/40 bg-background px-4 py-2 text-sm text-destructive shadow-lg"
            }
          >
            {toast.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
