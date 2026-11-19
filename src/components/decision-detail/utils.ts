import { unwrapSourceAnnotations } from '@/lib/legal-display-text';
import { decisionDate } from '@/lib/decision-date';

const REASON_CATEGORY_LABELS: Record<string, string> = {
  absence: '무단결근/태만',
  workplace_bullying: '직장내괴롭힘',
  probation: '수습해고',
  incompetence: '업무능력부족',
  contract_expiry: '갱신기대권/계약만료',
  transfer: '전보/인사이동',
  violence: '폭언/폭행',
  worker_status: '근로자성',
  sexual_harassment: '성희롱',
  embezzlement: '횡령/배임',
  misconduct: '비위행위',
  redundancy: '경영상해고',
  no_dismissal: '해고부존재/사직',
  discrimination: '차별시정',
  union_activity: '부당노동행위',
  other: '기타',
};

export function formatDecisionDate(value?: string | null) {
  return decisionDate(value)?.replace(/-/g,'.')??null;
}

export function translateReasonCategory(code: string) {
  return REASON_CATEGORY_LABELS[code] || code;
}

export function getPreferredSummary(item: {
  summary?: string | null;
  summary_short?: string | null;
  holding_summary?: string | null;
  key_issue?: string | null;
}) {
  return item.holding_summary || item.summary || item.summary_short || item.key_issue || '';
}

export function getPreferredDetail(item: {
  holding_points?: string | null;
  key_issue?: string | null;
}) {
  return item.holding_points || item.key_issue || '';
}

export function normalizeSnippetMarkdown(raw: string): string {
  return unwrapSourceAnnotations(raw)
    .replace(/^#{1,4}\s+(.+)$/gm, '**$1**')
    .replace(/([^\n])(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/g, '$1\n$2')
    .replace(/([^\n])(□\s)/g, '$1\n\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
