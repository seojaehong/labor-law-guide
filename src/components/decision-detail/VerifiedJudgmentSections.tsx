import { unwrapSourceAnnotations } from "@/lib/legal-display-text";
import { exportAttrs, splitHeadLine } from "@/lib/decision-export";

// 검증 전문(parse_version local-verified-v1)의 절을 읽기 좋게 그린다.
//   머리(type head, 제목 없음) — 작은 회색 글씨의 표제·값 표
//   주문 — 강조 상자
//   그 밖의 절 — 제목이 있는 문단
// 화면 글자를 모으면 원문 줄이 그대로 나오도록 표제와 값 사이 원래 공백을 글자로 남긴다
// (격자 안의 공백뿐인 글자는 그려지지 않는다).

export type JudgmentSection = { title?: string; text?: string; type?: string; index?: number };

const compact = (value: string) => value.replace(/\s+/g, "");

function HeadBlock({ text, id }: { text: string; id: string }) {
  return (
    <div
      id={id}
      {...exportAttrs("section", "", false, true)}
      className="mb-6 grid grid-cols-[fit-content(9rem)_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-3 py-3 text-xs leading-5 text-muted-foreground sm:px-4"
    >
      {text.split(/\r?\n/).map((line, index) => {
        const parts = splitHeadLine(line);
        if (!parts) {
          return line.trim() ? (
            <div key={index} className="col-span-2 break-words">{line}</div>
          ) : (
            <div key={index} className="col-span-2 h-1" />
          );
        }
        return (
          <div key={index} className="contents">
            <span className="break-words font-medium text-foreground/80">{parts.label}</span>
            {parts.gap}
            <span className="min-w-0 break-words">{parts.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function VerifiedJudgmentSections({ sections, fullText }: { sections: JudgmentSection[]; fullText: string }) {
  if (sections.length === 0) {
    return (
      <p {...exportAttrs("section", "", false)} className="reading-prose whitespace-pre-wrap break-words">
        {fullText}
      </p>
    );
  }

  const parts = sections.map((section, index) => ({
    key: `${section.type || "section"}-${section.index ?? index}`,
    anchor: `judgment-part-${index}`,
    head: section.type === "head",
    title: unwrapSourceAnnotations(section.title || "").trim(),
    text: unwrapSourceAnnotations(section.text || ""),
  }));
  const titled = parts.filter((part) => !part.head && part.title);

  return (
    <div className="min-w-0">
      {titled.length > 1 ? (
        <nav aria-label="판결문 절 바로가기" className="mb-4 flex flex-wrap gap-1.5">
          {titled.map((part) => (
            <a
              key={part.key}
              href={`#${part.anchor}`}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {part.title}
            </a>
          ))}
        </nav>
      ) : null}

      {parts.map((part) => {
        if (part.head) return <HeadBlock key={part.key} id={part.anchor} text={part.text} />;
        const isOrder = compact(part.title) === "주문";
        return (
          <section key={part.key} id={part.anchor} className="mb-6 scroll-mt-24 last:mb-0">
            {part.title ? (
              <h3 className="mb-2 text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {part.title}
              </h3>
            ) : null}
            {isOrder ? (
              <div className="rounded-lg border border-primary/25 border-l-4 border-l-primary bg-primary/5 px-4 py-3">
                <p {...exportAttrs("section", part.title, false)} className="reading-prose whitespace-pre-wrap break-words font-medium">
                  {part.text}
                </p>
              </div>
            ) : (
              <p {...exportAttrs("section", part.title, false)} className="reading-prose whitespace-pre-wrap break-words">
                {part.text}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
