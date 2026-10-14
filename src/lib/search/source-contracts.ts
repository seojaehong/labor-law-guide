import type { SearchCard } from './types';

export type DecisionSourceProvider = NonNullable<SearchCard['source_provider']>;

export type DecisionDetailKind = 'nlrc-decision' | 'bigcase-case' | 'lawgo-precedent';

export type DecisionSourceTable = 'nlrc_decisions' | 'cases' | 'lawgo_precedents';

export interface DecisionSourceContract {
  provider: DecisionSourceProvider;
  idPrefix: string | null;
  detailTable: DecisionSourceTable;
  detailKind: DecisionDetailKind;
  isSourceAware: boolean;
}

export interface DecisionSourceResolution extends DecisionSourceContract {
  id: string;
  routePath: string;
}

const DECISION_SOURCE_CONTRACTS: Record<DecisionSourceProvider, DecisionSourceContract> = {
  nlrc: {
    provider: 'nlrc',
    idPrefix: null,
    detailTable: 'nlrc_decisions',
    detailKind: 'nlrc-decision',
    isSourceAware: false,
  },
  bigcase: {
    provider: 'bigcase',
    idPrefix: 'bc_',
    detailTable: 'cases',
    detailKind: 'bigcase-case',
    isSourceAware: true,
  },
  lawgo: {
    provider: 'lawgo',
    idPrefix: 'prec_',
    detailTable: 'lawgo_precedents',
    detailKind: 'lawgo-precedent',
    isSourceAware: true,
  },
};

const DECISION_SOURCE_LABELS: Record<DecisionSourceProvider, string> = {
  nlrc: '노동위 판정례',
  bigcase: '법원 판례',
  lawgo: '법제처 판례',
};

export function isDecisionSourceProvider(value: unknown): value is DecisionSourceProvider {
  return value === 'nlrc' || value === 'bigcase' || value === 'lawgo';
}

export function normalizeDecisionSourceProvider(value: unknown): DecisionSourceProvider | null {
  if (isDecisionSourceProvider(value)) return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  return isDecisionSourceProvider(normalized) ? normalized : null;
}

export function detectDecisionSourceProvider(id: string): DecisionSourceProvider {
  if (id.startsWith('prec_')) return 'lawgo';
  if (id.startsWith('bc_')) return 'bigcase';
  return 'nlrc';
}

export function resolveDecisionSourceContract(input: {
  id?: string | null;
  sourceProvider?: unknown;
}): DecisionSourceResolution {
  const detected = detectDecisionSourceProvider(input.id ?? '');
  // A URL hint cannot contradict a known provider prefix. Legacy IDs may retain a hint.
  const provider = detected !== 'nlrc' || /^(?:id_|el_|nlrc_)/.test(input.id ?? '') ? detected : normalizeDecisionSourceProvider(input.sourceProvider) ?? detected;
  const contract = DECISION_SOURCE_CONTRACTS[provider];
  const id = input.id ?? '';

  return {
    ...contract,
    id,
    routePath: id ? `/decisions/${encodeURIComponent(id)}` : '/decisions',
  };
}

export function getDecisionDetailRoutePath(id: string) {
  return `/decisions/${encodeURIComponent(id)}`;
}

export function getDecisionSourceLabel(provider: DecisionSourceProvider) {
  return DECISION_SOURCE_LABELS[provider];
}

export function getDecisionDetailHref(input: {
  id?: string | null;
  sourceProvider?: unknown;
}) {
  const resolution = resolveDecisionSourceContract(input);
  if (!resolution.id) return '/decisions';
  return resolution.isSourceAware
    ? `${resolution.routePath}?source=${resolution.provider}`
    : resolution.routePath;
}
