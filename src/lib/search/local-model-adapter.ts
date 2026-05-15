import type { ParsedCandidateQuery } from '@/lib/search/types';

export interface SearchLocalModelParseInput {
  rawQuery: string;
  fallback: ParsedCandidateQuery;
}

export interface SearchLocalModelAdapter {
  provider: string;
  parseQuery?: (input: SearchLocalModelParseInput) => Promise<ParsedCandidateQuery | null>;
}

function isEnabled(): boolean {
  return process.env.SEARCH_LOCAL_MODEL_ENABLED === 'true';
}

function createStubAdapter(): SearchLocalModelAdapter | null {
  if (!isEnabled()) {
    return null;
  }

  const provider = process.env.SEARCH_LOCAL_MODEL_PROVIDER || 'qwen';

  return {
    provider,
    async parseQuery() {
      return null;
    },
  };
}

let cachedAdapter: SearchLocalModelAdapter | null | undefined;

export function getSearchLocalModelAdapter(): SearchLocalModelAdapter | null {
  if (cachedAdapter !== undefined) {
    return cachedAdapter;
  }

  cachedAdapter = createStubAdapter();
  return cachedAdapter;
}
