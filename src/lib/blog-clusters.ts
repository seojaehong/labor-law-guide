/**
 * blog_clusters.json 서버-사이드 로더 + 매핑 유틸.
 *
 * validate_topics.py의 파이썬 로직을 TypeScript로 포팅.
 * 소스 오브 트루스는 /home/ubuntu/work-orchestrator/data/blog_clusters.json,
 * 이 프로젝트에는 src/data/blog-clusters.json으로 복사되어 있음.
 */

import CLUSTERS_DATA from '@/data/blog-clusters.json';

export type SubclusterKey = readonly [string, string];

interface SubclusterDef {
  synonym_group?: string;
  keywords?: string[];
}

interface ClusterDef {
  label?: string;
  primary_author?: string;
  cross_authors?: string[];
  note?: string;
  subclusters?: Record<string, SubclusterDef>;
}

interface AuthorMatrixEntry {
  role?: string;
  primary_clusters?: string[];
  cross_clusters?: string[];
  saturation_exception?: boolean;
  note?: string;
}

interface ClustersData {
  version?: string;
  synonym_groups?: Record<string, string[]>;
  clusters?: Record<string, ClusterDef>;
  author_matrix?: Record<string, AuthorMatrixEntry>;
  cooldown_rules?: Record<string, number>;
}

const DATA = CLUSTERS_DATA as unknown as ClustersData;

// STOP WORDS (Python 코드와 동일한 최소 집합)
const STOP_WORDS = new Set<string>([
  '실무', '한계', '정리', '도입', '신청', '영향', '체크리스트', '해설',
  '가이드', '매뉴얼', '단계', '핵심', '쟁점', '판단', '기준', '범위',
  '내용', '효과', '방법', '절차', '실제', '상황', '사례', '판정례', '판례',
  '완전', '총정리', '핵심정리',
  '비교', '대비', '대조', '검토', '점검', '분석',
  '인상', '인하', '증가', '감소', '상승', '하락', '확대', '축소',
  '최근', '지난', '올해', '이번', '다음', '향후', '신규', '기존',
  '되나', '된다', '된다면', '되어', '됨', '되는', '되는지',
  '없으면', '없는', '없다', '없이', '있으면', '있는', '있다',
  '한다', '하나', '하면', '하지', '하기', '어떻게', '어떤', '얼마',
  '경우', '때문', '하면', '점', '내', '외', '위', '아래',
]);

const YEAR_PATTERN = /^\d{4}년?$/;
const EMOJI_PATTERN = /[🎯📌🔍⚖️📊🚀📚🏆💡⚠️📝🎬🎤🌟✨🔥💼🏢👥]/g;
const WORD_PATTERN = /[가-힣a-zA-Z0-9]+/g;

// synonym_groups 필터링 (_desc 같은 메타 키 제외)
export const SYNONYM_GROUPS: Record<string, string[]> = Object.fromEntries(
  Object.entries(DATA.synonym_groups || {}).filter(([k]) => !k.startsWith('_')),
);

// 단어 → canonical(group_id) 맵
const SYNONYM_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [groupId, words] of Object.entries(SYNONYM_GROUPS)) {
    for (const w of words) {
      m.set(w.replace(/\s+/g, ''), groupId);
    }
  }
  return m;
})();

// canonical(단어 or group_id) → [(cluster, sub), ...] 인덱스
const SUBCLUSTER_INDEX: Map<string, SubclusterKey[]> = (() => {
  const idx = new Map<string, SubclusterKey[]>();
  const clusters = DATA.clusters || {};
  for (const [clusterId, cluster] of Object.entries(clusters)) {
    if (typeof cluster !== 'object') continue;
    const subs = cluster.subclusters || {};
    for (const [subId, sub] of Object.entries(subs)) {
      const entry: SubclusterKey = [clusterId, subId];
      if (sub.synonym_group) {
        const arr = idx.get(sub.synonym_group) || [];
        arr.push(entry);
        idx.set(sub.synonym_group, arr);
      }
      for (const kw of sub.keywords || []) {
        const key = kw.replace(/\s+/g, '');
        const arr = idx.get(key) || [];
        arr.push(entry);
        idx.set(key, arr);
      }
    }
  }
  return idx;
})();

function normalize(w: string): string {
  const key = w.replace(/\s+/g, '');
  return SYNONYM_MAP.get(key) || key;
}

export function extractKeywords(text: string): Set<string> {
  if (!text) return new Set();
  const clean = text.replace(EMOJI_PATTERN, '');
  const words = clean.match(WORD_PATTERN) || [];
  const raw = new Set<string>();
  for (const w of words) {
    if (w.length >= 2 && !STOP_WORDS.has(w) && !YEAR_PATTERN.test(w)) {
      raw.add(w);
    }
  }
  // compound substring 매칭 (≥2자)
  const textCompact = text.replace(/\s+/g, '');
  for (const compound of SYNONYM_MAP.keys()) {
    if (compound.length >= 2 && textCompact.includes(compound)) {
      raw.add(compound);
    }
  }
  // 정규화
  const normalized = new Set<string>();
  for (const w of raw) normalized.add(normalize(w));
  return normalized;
}

export function mapToSubclusters(keywords: Set<string>): SubclusterKey[] {
  const subs = new Set<string>();
  const out: SubclusterKey[] = [];
  for (const kw of keywords) {
    const entries = SUBCLUSTER_INDEX.get(kw);
    if (!entries) continue;
    for (const e of entries) {
      const key = `${e[0]}::${e[1]}`;
      if (!subs.has(key)) {
        subs.add(key);
        out.push(e);
      }
    }
  }
  return out;
}

export interface ArticleLike {
  title?: string | null;
  subtitle?: string | null;
  tags?: string[] | null;
}

export function articleSubclusters(art: ArticleLike): SubclusterKey[] {
  const combined = [
    art.title || '',
    art.subtitle || '',
    ...(art.tags || []),
  ].join(' ');
  return mapToSubclusters(extractKeywords(combined));
}

export function listAllSubclusters(): { cluster: string; sub: string; label?: string }[] {
  const out: { cluster: string; sub: string; label?: string }[] = [];
  for (const [cid, c] of Object.entries(DATA.clusters || {})) {
    if (typeof c !== 'object') continue;
    for (const sid of Object.keys(c.subclusters || {})) {
      out.push({ cluster: cid, sub: sid, label: c.label });
    }
  }
  return out;
}

export const CLUSTER_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [cid, c] of Object.entries(DATA.clusters || {})) {
    if (typeof c === 'object' && c.label) out[cid] = c.label;
  }
  return out;
})();

export const AUTHOR_MATRIX = DATA.author_matrix || {};
export const COOLDOWN_RULES = DATA.cooldown_rules || {};

// 편의 상수
export const SUBCLUSTER_SATURATED_COUNT = COOLDOWN_RULES.sub_cluster_saturated_count || 5;
export const SUBCLUSTER_COOLDOWN_COUNT = COOLDOWN_RULES.sub_cluster_cooldown_count || 3;
