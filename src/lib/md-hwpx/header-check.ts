/**
 * S0 — hwpx header 불변식 검사(편집기술사양 U3·U4·U5, 261119).
 *
 * 한글은 charPr·paraPr·borderFill 을 id 가 아니라 컨테이너 안 등장 순서로 읽는다.
 * 중간에 항목을 끼우면 itemCnt 가 맞아도 뒤 항목이 한 칸씩 밀려 다른 모양이 붙는다(260809·260827 실측).
 * 범위 밖 id 를 가리키는 문단·글자는 오류 없이 0번 모양(10pt·160%)으로 떨어진다(260824 실측).
 */

export type HeaderIssue = {
  code: 'ID_ORDER' | 'ITEM_CNT' | 'REF_RANGE';
  container: string;
  message: string;
};

// [컨테이너, 항목 태그, 첫 id, section 이 가리키는 속성]
const CONTAINERS: [string, string, number, string | null][] = [
  ['charProperties', 'charPr', 0, 'charPrIDRef'],
  ['paraProperties', 'paraPr', 0, 'paraPrIDRef'],
  ['borderFills', 'borderFill', 1, 'borderFillIDRef'],
  ['tabProperties', 'tabPr', 0, null],
  ['styles', 'style', 0, null],
];

function block(xml: string, container: string): string | null {
  const m = new RegExp(`<hh:${container}\\b([^>]*)>([\\s\\S]*?)</hh:${container}>`).exec(xml);
  return m ? m[0] : null;
}

export function checkHeader(headerXml: string, sectionXml?: string): HeaderIssue[] {
  const issues: HeaderIssue[] = [];
  const counts: Record<string, { base: number; n: number }> = {};
  for (const [container, tag, base, ref] of CONTAINERS) {
    const b = block(headerXml, container);
    if (!b) continue;
    const ids = [...b.matchAll(new RegExp(`<hh:${tag}\\s[^>]*?\\bid="(\\d+)"`, 'g'))].map((m) => Number(m[1]));
    const declared = Number(/itemCnt="(\d+)"/.exec(b)?.[1] ?? NaN);
    const bad = ids.findIndex((id, i) => id !== base + i);
    if (bad >= 0) {
      issues.push({
        code: 'ID_ORDER',
        container,
        message: `${tag} ${bad + 1}번째 항목 id=${ids[bad]} (순서대로면 ${base + bad}) — 한글은 id 가 아니라 순서로 읽는다`,
      });
    }
    if (declared !== ids.length) {
      issues.push({ code: 'ITEM_CNT', container, message: `itemCnt=${declared} 인데 ${tag} 는 ${ids.length}개` });
    }
    if (ref) counts[ref] = { base, n: ids.length };
  }
  if (sectionXml) {
    for (const [container, , , ref] of CONTAINERS) {
      if (!ref || !counts[ref]) continue;
      const { base, n } = counts[ref];
      const out = [...new Set([...sectionXml.matchAll(new RegExp(`\\b${ref}="(\\d+)"`, 'g'))].map((m) => Number(m[1])))]
        .filter((id) => id < base || id >= base + n);
      if (out.length) {
        issues.push({
          code: 'REF_RANGE',
          container,
          message: `section 의 ${ref}=${out.join(',')} 가 범위(${base}~${base + n - 1}) 밖 — 한글은 0번 모양으로 떨어뜨린다`,
        });
      }
    }
  }
  return issues;
}
