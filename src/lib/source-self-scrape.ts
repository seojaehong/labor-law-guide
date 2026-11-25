// 우리 사이트 화면을 판결문 원천으로 잘못 저장한 수집본 거름.
//
// 2026-03-28~04-01 recollect-v3 수집이 법원 판례(bc_) 10,307건에서 bigcase 대신 nlrc_decisions.url
// (= 우리 상세 페이지 https://노란봉투법.com/decisions/bc_…)을 받아 decision_source_documents 에
// source_provider='bigcase' 로 넣었다. 그 본문은 우리 화면 글자(「전문가 상담이 필요하신가요?」·
// 「무료 상담 신청하기」·「AI에게 질문하기」·「판정결과 granted」)와 우리 AI 정리(핵심 쟁점·결과 요약)다.
// 화면 글자만 잘라 내면 AI 정리가 「판결문 원문」으로 남으므로, 우리 도메인에서 온 행은 통째로 버린다.
// 바깥 원천 본문 끝에 화면 글자가 붙은 경우에 대비해 줄 단위 표지로 꼬리를 잘라 내는 함수도 둔다.

const OWN_HOSTS = new Set([
  'yellowenvelope.kr',
  'xn--o80bk8isxeinax68f.com', // 노란봉투법.com
]);

/** 우리 사이트 주소인지 — 원천 주소로 쓸 수 없다. */
export function isOwnSiteUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.startsWith('www.')) host = host.slice(4);
  return OWN_HOSTS.has(host);
}

// 줄 전체가 이것과 같을 때만 화면 글자로 본다. 낱말 단위로 잡으면 판결문(「상담」·「판정결과」)을 깎는다.
const CHROME_LINES = new Set([
  '전문가 상담이 필요하신가요?',
  '노무법인 위너스에서 사업장 맞춤 상담을 제공합니다.',
  '무료 상담 신청하기',
  'AI에게 질문하기',
  '이 판정례가 우리 사안에 적용되는지 확인',
  '유사 판정례 검색',
  '같은 유형의 다른 판정 사례 확인',
  '이 판정례와 유사한 사안이라면 노무법인 위너스에 문의하세요.',
]);

// 우리 상세 페이지 머리 — 문서 첫머리(앞 몇 줄)에 있을 때만 본다.
const OWN_HEAD_LINES = new Set(['AI 노동법 상담', '← 검색으로', '판정례 검색']);
const OWN_TITLE_LINE = /\|\s*노란봉투법 가이드\s*$/;
const HEAD_WINDOW = 6;

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** 문서가 우리 상세 페이지 머리로 시작하는지. */
export function looksLikeOwnPage(text: unknown): boolean {
  if (typeof text !== 'string' || !text) return false;
  const head = lines(text).map((line) => line.trim()).filter(Boolean).slice(0, HEAD_WINDOW);
  return head.some((line) => OWN_TITLE_LINE.test(line) || OWN_HEAD_LINES.has(line));
}

/**
 * 첫 화면 글자 줄부터 끝까지 잘라 낸다. 화면 글자 줄이 없으면 입력을 그대로 돌려준다.
 * 우리 화면은 화면 글자 바로 앞에 「원문 보기」·「유사 판정례」·「판정 요지」 덩어리를 두므로,
 * 첫 표지 줄 바로 위에 붙은 그 줄들도 함께 걷는다.
 */
export function stripSiteChrome(text: string): string {
  const all = lines(text);
  const first = all.findIndex((line) => CHROME_LINES.has(line.trim()));
  if (first < 0) return text;
  let cut = first;
  const LEAD = new Set(['원문 보기', '유사 판정례', '판정 요지']);
  while (cut > 0 && (LEAD.has(all[cut - 1].trim()) || all[cut - 1].trim() === '')) cut -= 1;
  return all.slice(0, cut).join('\n').replace(/\s+$/, '');
}

type SourceRowLike = {
  source_url?: unknown;
  full_text_clean?: unknown;
  full_text_raw?: unknown;
  body_sections?: unknown;
};

function stripSections(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  let changed = false;
  const next = value.flatMap((section) => {
    if (!section || typeof section !== 'object' || typeof (section as { text?: unknown }).text !== 'string') return [section];
    const text = (section as { text: string }).text;
    const stripped = stripSiteChrome(text);
    if (stripped === text) return [section];
    changed = true;
    return stripped.trim() ? [{ ...(section as object), text: stripped }] : [];
  });
  return changed ? next : value;
}

/**
 * 원천 행 거름 — 우리 사이트를 긁은 행이면 null(버림), 바깥 원천이면 꼬리 화면 글자만 걷은 행.
 * 깨끗한 행은 같은 값을 돌려준다.
 */
export function screenSourceRow<T extends SourceRowLike>(row: T): T | null {
  if (isOwnSiteUrl(row.source_url)) return null;
  if (looksLikeOwnPage(row.full_text_clean) || looksLikeOwnPage(row.full_text_raw)) return null;
  const clean = typeof row.full_text_clean === 'string' ? stripSiteChrome(row.full_text_clean) : row.full_text_clean;
  const raw = typeof row.full_text_raw === 'string' ? stripSiteChrome(row.full_text_raw) : row.full_text_raw;
  const sections = stripSections(row.body_sections);
  if (clean === row.full_text_clean && raw === row.full_text_raw && sections === row.body_sections) return row;
  return { ...row, full_text_clean: clean, full_text_raw: raw, body_sections: sections };
}
