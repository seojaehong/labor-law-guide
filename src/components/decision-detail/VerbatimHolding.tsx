"use client";

import { useEffect, useId, useRef, useState } from "react";
import { exportAttrs } from "@/lib/decision-export";
import { VERBATIM_HOLDING_LABEL } from "@/lib/judgment-reason";
import { cn } from "@/lib/utils";

// 판결문 원문에서 잘라 낸 요지(이유 중 판단 부분)를 줄바꿈 그대로 보인다.
// 길면 높이만 CSS 로 줄인다 — 접힌 때에도 글자 전체가 DOM 에 있어 요지 복사가 온전하다.
// 펼치기 단추와 흐림 막은 표지(data-export) 밖에 두어 복사 글자에 섞이지 않게 한다.
// data-export-verbatim — 요지 복사·내려받기가 이 글자를 공용 정리(줄 끝 공백·빈 줄 줄이기) 없이 그대로 모은다.

/** 접힌 높이(max-h-80 = 20rem) */
const CLAMP_REM = 20;

export default function VerbatimHolding({ text, collapsible }: { text: string; collapsible: boolean }) {
  const id = useId();
  const body = useRef<HTMLParagraphElement | null>(null);
  const [open, setOpen] = useState(false);
  const [fits, setFits] = useState(false);

  // 서버는 글자 수로 접을지 정한다. 화면 폭에서 글자가 접힌 높이 안에 다 들어가면 단추와 흐림 막을 거둔다.
  useEffect(() => {
    const el = body.current;
    if (!collapsible || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setFits(el.offsetHeight <= CLAMP_REM * rem + 1);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [collapsible]);

  const foldable = collapsible && !fits;
  const clamped = foldable && !open;
  return (
    <div className="min-w-0">
      <div className={cn("relative", clamped && "max-h-80 overflow-hidden")}>
        <p ref={body} id={id} {...exportAttrs("summary", VERBATIM_HOLDING_LABEL, false)} data-export-verbatim="" className="reading-prose whitespace-pre-wrap break-words">
          {text}
        </p>
        {clamped ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
        ) : null}
      </div>
      {foldable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="mt-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          {open ? "접기" : "전부 보기"}
        </button>
      ) : null}
    </div>
  );
}
