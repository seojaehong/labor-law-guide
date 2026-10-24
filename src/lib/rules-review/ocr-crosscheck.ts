// 스캔 쪽 두 판독 대조 — 모델(하이쿠·소넷)이 읽은 줄의 숫자·날짜·조 번호·원문자가 두 번째 판독(브라우저 tesseract)에도 나오는지 본다.
// 맞게 읽었는지는 알 수 없다. 두 판독이 다른 줄을 짚어 담당자가 원문과 먼저 대조하게 할 뿐이다.
// 줄바꿈·띄어쓰기·순서는 두 판독이 다르게 낸다 — 줄끼리 맞추지 않고, 쪽 전체에서 비슷한 자리에 같은 표지가 있는지 본다.

export interface Flagged {
  /** 모델이 읽은 그 쪽 줄 번호(1부터) */
  line: number;
  text: string;
  /** 두 번째 판독에서 찾지 못한 표지 */
  anchors: string[];
}

/** checked = 표지가 있어 대조한 줄 수. not_checked = 두 번째 판독이 없음(실패·시간 초과) 또는 숫자를 대부분 놓침(low_coverage) — 「일치」가 아니다 */
export type CrossCheck = { state: 'checked'; checked: number; flagged: Flagged[] } | { state: 'not_checked'; reason?: 'low_coverage' };
export type PageCheck = { page: number } & CrossCheck;

// 조·항·호 → 날짜 → 원문자 → 숫자 순. 한 글자를 두 표지가 나눠 갖지 않는다
const ANCHOR = /제\s*\d+\s*조(?:\s*의\s*\d+)?|제\s*\d+\s*[항호장절관편]|\d{4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}\s*\.?|[①-⑳]|\d[\d,]*\d|\d/g;
const CIRCLED = /^[①-⑳]$/;
const DATE = /^(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/;

const norm = (a: string) => {
  const d = a.match(DATE);
  if (d) return `${d[1]}.${Number(d[2])}.${Number(d[3])}.`;
  return a.replace(/[\s,]/g, '');
};

/** 줄에서 대조할 표지 — 조·항·호(제N조의M), 날짜(2024.4.26.), 원문자(①), 숫자 */
export function anchorsOf(text: string): string[] {
  return [...text.matchAll(ANCHOR)].map((m) => norm(m[0]));
}

/** 같은 표지가 이만큼(쪽 길이 대비) 떨어진 자리까지는 같은 것으로 본다 — 표 칸 순서가 달라도 걸리지 않게 넉넉히 */
const WINDOW = 0.35;

type At = { a: string; pos: number };
function located(text: string): At[] {
  const t = text.replace(/\s+/g, ' ');
  return [...t.matchAll(ANCHOR)].map((m) => ({ a: norm(m[0]), pos: (m.index ?? 0) / Math.max(1, t.length) }));
}

export function crossCheck(modelLines: string[], other: string | null | undefined): CrossCheck {
  if (!other || !other.trim()) return { state: 'not_checked' };
  const theirs = located(other);
  // tesseract(kor)는 원문자를 거의 읽지 못한다(①→「0)」·②→「@)」 실측). 원문자를 하나도 내지 못한 쪽은 원문자를 대조하지 않는다
  const circled = theirs.some((t) => CIRCLED.test(t.a));
  const used = new Array<boolean>(theirs.length).fill(false);
  const total = Math.max(1, modelLines.reduce((n, l) => n + l.replace(/\s+/g, ' ').length + 1, 0));
  let offset = 0, checked = 0;
  const flagged: Flagged[] = [];
  modelLines.forEach((line, i) => {
    const t = line.replace(/\s+/g, ' ');
    const mine = [...t.matchAll(ANCHOR)].map((m) => ({ a: norm(m[0]), pos: (offset + (m.index ?? 0)) / total })).filter((m) => circled || !CIRCLED.test(m.a));
    offset += t.length + 1;
    if (!mine.length) return;
    checked++;
    const missing: string[] = [];
    for (const m of mine) {
      let best = -1;
      for (let j = 0; j < theirs.length; j++) {
        if (used[j] || theirs[j].a !== m.a) continue;
        const d = Math.abs(theirs[j].pos - m.pos);
        if (d <= WINDOW && (best < 0 || d < Math.abs(theirs[best].pos - m.pos))) best = j;
      }
      if (best < 0) missing.push(m.a);
      else used[best] = true;
    }
    if (missing.length) flagged.push({ line: i + 1, text: line, anchors: missing });
  });
  // 대조한 줄의 절반 넘게 걸리면 모델이 틀린 게 아니라 두 번째 판독이 숫자를 놓친 쪽이다(빽빽한 표 실측 15줄 중 14줄) — 줄마다 걸지 않는다
  if (checked >= 4 && flagged.length * 2 > checked) return { state: 'not_checked', reason: 'low_coverage' };
  return { state: 'checked', checked, flagged };
}

/** 파일별 쪽 대조 결과를 읽은 결과(report.pdf)에 붙인다 — 받은 배열은 고치지 않는다 */
export function attachChecks<T extends { path: string }>(pdf: T[], checks: Map<string, PageCheck[]>): (T & { xcheck?: PageCheck[] })[] {
  return pdf.map((p) => {
    const c = checks.get(p.path);
    return c?.length ? { ...p, xcheck: [...c].sort((a, b) => a.page - b.page) } : p;
  });
}

/** 화면에 쓸 셈 — 대조한 스캔 쪽 수, 두 판독이 다른 줄, 대조 못 한 쪽 수. 대조 기록이 없으면(옛 작업) null */
export function summarize(p: { xcheck?: PageCheck[] }): { pages: number; flagged: ({ page: number } & Flagged)[]; notChecked: number } | null {
  if (!p.xcheck?.length) return null;
  return {
    pages: p.xcheck.length,
    flagged: p.xcheck.flatMap((c) => (c.state === 'checked' ? c.flagged.map((f) => ({ page: c.page, ...f })) : [])),
    notChecked: p.xcheck.filter((c) => c.state === 'not_checked').length,
  };
}
