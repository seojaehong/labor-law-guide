import { createElement } from 'react';
import type { Components } from 'react-markdown';

// 인용 마크 본문에서 제거 + 답변 끝에 깔끔한 "참고 자료" footer 1개로 통합
export type EvidenceId = { type: 'FAQ' | 'CASE' | 'COURT' | 'INTERP'; id: string };
type Citation = EvidenceId & { href: string };

const SITE_ORIGIN = 'https://yellowenvelope.kr';
const SOURCE_PATH = /^\/(?:faq|decisions|cases|interpretations)(?:[/?#]|$)/;

// Decode an identity exactly once. Percent escapes left after decoding are not
// another spelling of a manifest ID (in particular, reject double encoding).
function decodeIdentity(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return /[%/\\\u0000-\u0020]/.test(decoded) ? null : decoded;
  } catch {
    return null;
  }
}

function sourceLink(href: string): { isSource: boolean; evidence: EvidenceId | null } {
  try {
    const url = new URL(href, SITE_ORIGIN);
    // Treat encoded route names as source links too, but accept only literal
    // route names below. This avoids encoded-path variants bypassing the gate.
    let decodedPath = url.pathname;
    for (let i = 0; i < 2; i++) {
      try { decodedPath = decodeURIComponent(decodedPath); } catch { break; }
    }
    const isSource = SOURCE_PATH.test(url.pathname) || SOURCE_PATH.test(decodedPath);
    if (!isSource) return { isSource, evidence: null };
    if (url.origin !== SITE_ORIGIN || url.username || url.password || href.includes('\\') || url.hash) {
      return { isSource: true, evidence: null };
    }
    if (url.pathname === '/faq') {
      const entries = [...url.searchParams.entries()];
      const id = url.searchParams.get('id');
      return { isSource: true, evidence: entries.length === 1 && entries[0][0] === 'id' && id !== null && /^\d+$/.test(id) ? { type: 'FAQ', id } : null };
    }
    if (url.search) return { isSource: true, evidence: null };
    const match = url.pathname.match(/^\/(decisions|cases|interpretations)\/([^/]+)$/);
    const id = match ? decodeIdentity(match[2]) : null;
    if (!match || !id) return { isSource: true, evidence: null };
    const type = { decisions: 'CASE', cases: 'COURT', interpretations: 'INTERP' }[match[1]] as EvidenceId['type'];
    return { isSource: true, evidence: { type, id } };
  } catch {
    return { isSource: SOURCE_PATH.test(href) || /\/(?:faq|decisions|cases|interpretations)(?:[/?#]|$)/.test(href), evidence: null };
  }
}

export function normalizeValidatedHref(href: string, evidence: EvidenceId[] = []): string | null {
  const parsed = sourceLink(href);
  if (!parsed.isSource) return href;
  const citation = parsed.evidence;
  return citation && evidence.some(item => item.type === citation.type && item.id === citation.id)
    ? citationHref(citation) : null;
}

// Enforce the contract at the rendered anchor too: reference links and GFM
// autolinks need not appear as inline Markdown links in the input string.
export function citationLinkComponents(evidence: EvidenceId[] = []): Components {
  return {
    a: ({ href, children, title }) => {
      const verified = href ? normalizeValidatedHref(href, evidence) : null;
      return verified === null
        ? createElement('span', null, children)
        : createElement('a', { href: verified, title }, children);
    },
  };
}

export function linkifyFaqCitations(text: string, evidence: EvidenceId[] = []): string {
  const allowed = new Set(evidence.map(({ type, id }) => `${type}-${id}`));
  const cited: Citation[] = [];
  const seen = new Set<string>();
  const push = (type: Citation['type'], id: string, href: string) => {
    const key = `${type}-${id}`;
    if (!allowed.has(key) || seen.has(key)) return;
    seen.add(key);
    cited.push({ type, id, href });
  };

  // A model can also emit direct local source links; apply the same ID contract.
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label: string, href: string) => {
    const normalized = normalizeValidatedHref(href, evidence);
    return normalized === null ? label : normalized === href ? full : `[${label}](${normalized})`;
  });

  // 1) 괄호 형태: [FAQ#123, FAQ#456] / [CASE#id] / [COURT#id] / [INTERP#id]
  let out = text.replace(/\[FAQ#[\d,\sFAQ#]+\]/g, (m) => {
    const ids = m.match(/\d+/g) || [];
    ids.forEach((id) => push('FAQ', id, `/faq?id=${id}`));
    return '';
  });
  out = out.replace(/\[CASE#([A-Za-z0-9_\-]+)\]/g, (_, id) => {
    push('CASE', id, `/decisions/${id}`);
    return '';
  });
  out = out.replace(/\[COURT#([^\]]+)\]/g, (_, id) => {
    push('COURT', id, `/cases/${encodeURIComponent(id)}`);
    return '';
  });
  out = out.replace(/\[INTERP#([^\]]+)\]/g, (_, id) => {
    push('INTERP', id, `/interpretations/${encodeURIComponent(id)}`);
    return '';
  });

  // 2) 괄호 빠진 형태 (LLM이 형식 무시): FAQ#123 / CASE#xxx / COURT#xxx / INTERP#ml_xxx
  //    INTERP id 는 2026-10-05 부터 두 형태다 — ml_xxxx(molab) 와 「노사관계법제과-2110」(admin).
  //    admin 쪽은 한글과 전각 하이픈(임금복지과－2818)이 섞여 있어 영숫자만 받으면 잘린다.
  // iOS Safari < 16.4 호환: lookbehind 사용 금지 → 선행 문자 캡처 후 보존 방식
  out = out.replace(/(^|[^A-Za-z])FAQ#(\d+)/g, (_, prefix, id) => {
    push('FAQ', id, `/faq?id=${id}`);
    return prefix;
  });
  out = out.replace(/(^|[^A-Za-z])CASE#([A-Za-z0-9_\-]+)/g, (_, prefix, id) => {
    push('CASE', id, `/decisions/${id}`);
    return prefix;
  });
  out = out.replace(/(^|[^A-Za-z])COURT#([A-Za-z0-9_가-힣\-]+)/g, (_, prefix, id) => {
    push('COURT', id, `/cases/${encodeURIComponent(id)}`);
    return prefix;
  });
  out = out.replace(/(^|[^A-Za-z])INTERP#([A-Za-z0-9_가-힣\-－]+)/g, (_, prefix, id) => {
    push('INTERP', id, `/interpretations/${encodeURIComponent(id)}`);
    return prefix;
  });

  // 빈 인용으로 인해 남은 ", " ", ," "( )" 같은 잔여 정리
  out = out.replace(/\s*,\s*,\s*/g, ', ').replace(/\(\s*,?\s*\)/g, '').replace(/\s+([,.])/g, '$1');

  // 자동 footer: "참고 FAQ: ..." 서버 측 footer가 이미 있으면 중복 추가하지 않음
  if (cited.length > 0) {
    out = out.replace(/(?:\n\n---\n)?참고 FAQ:\s*[,\s]*$/g, '').trimEnd();
    const labels: Record<Citation['type'], string> = {
      FAQ: 'FAQ',
      CASE: '판정례',
      COURT: '판례',
      INTERP: '행정해석',
    };
    const groups = new Map<Citation['type'], Citation[]>();
    for (const c of cited) {
      if (!groups.has(c.type)) groups.set(c.type, []);
      groups.get(c.type)!.push(c);
    }
    const footer = ['', '', '---', '**참고 자료**'];
    for (const [type, list] of groups) {
      const items = list.map((c, i) => `[${labels[type]} ${i + 1}](${c.href})`).join(' · ');
      footer.push(`- ${labels[type]}: ${items}`);
    }
    out = out.trimEnd() + '\n' + footer.join('\n');
  }
  return out;
}

export function citationHref({ type, id }: EvidenceId): string {
  if (type === 'FAQ') return `/faq?id=${encodeURIComponent(id)}`;
  const root = { CASE: 'decisions', COURT: 'cases', INTERP: 'interpretations' }[type];
  return `/${root}/${encodeURIComponent(id)}`;
}

export function hasVerifiedCitation(text: string, evidence: EvidenceId[]): boolean {
  return evidence.some(({ type, id }) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`${type}#${escaped}(?=[,\\]\\s]|$)`).test(text);
  });
}
