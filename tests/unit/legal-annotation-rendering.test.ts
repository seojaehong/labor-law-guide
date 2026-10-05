import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type SourceDocument = {
  full_text_clean?: string | null;
  full_text_raw?: string | null;
  body_sections?: { title?: string; text?: string; type?: string; index?: number }[];
  coverage_ratio: number;
};

const database = vi.hoisted(() => ({
  decision: null as Record<string, unknown> | null,
  documents: [] as SourceDocument[],
  tables: [] as string[],
  filters: [] as [string, string, unknown][],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (!['cases', 'nlrc_decisions', 'decision_source_documents'].includes(table)) {
        throw new Error(`Unexpected database table: ${table}`);
      }
      database.tables.push(table);
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          database.filters.push([table, column, value]);
          return query;
        },
        order: () => query,
        maybeSingle: async () => ({ data: table === 'nlrc_decisions' ? database.decision : null, error: null }),
        limit: async () => ({ data: database.documents, error: null }),
      };
      return query;
    },
  },
}));
vi.mock('@/components/SubscribeForm', () => ({ default: () => null }));

import DecisionPage from '@/app/decisions/[id]/page';
import MarkdownSnippet from '@/app/database/_components/MarkdownSnippet';

const sourceUrl = 'https://example.invalid/judgment?case=synthetic&section=legal';
const legalText = '근로기준법 제23조 제1항에 따라 정당한 이유를 판단한다.';
const filler = '이 문장은 실제 사건과 관계없는 렌더링 검증용 합성 판결문입니다.\n'.repeat(40);
const holdingText = `<law_cite data-kind="holding">정리본 고유 문구: <law_cite>${legalText}</law_cite></law_cite> ${filler.slice(0, 150)}`;

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function expectNoAnnotations(html: string) {
  // Checking the serialized result also catches escaped wrappers visible as text.
  expect(html).not.toMatch(/law_cite/i);
}

beforeEach(() => {
  database.decision = freezeDeep({
    id: 'bc_annotation_fixture',
    title: '합성 판결문 렌더링 검증',
    department: '합성 법원',
    decision_date: '2026-10-03',
    case_number: '2026합성1',
    decision_result: '판결',
    holding_points: holdingText,
    holding_summary: '<law_cite data-kind="summary">판결요지의 법문도 보존한다.</law_cite>',
    url: sourceUrl,
    tags: [],
  });
  database.documents = [];
  database.tables = [];
  database.filters = [];
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Renderer tests must not access the network'); }));
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('DecisionPage removes source annotations at every actual body renderer', () => {
  it.each([
    {
      name: 'body_sections',
      documents: [{
        full_text_clean: `섹션 대신 표시되면 안 되는 전체 본문\n${filler}`,
        full_text_raw: `선택되지 않은 수집 원문\n${filler}`,
        body_sections: [{
          title: '<law_cite title="인용 > 표제">근로기준법 적용 조문</law_cite>',
          text: `섹션 고유 문구: &lt;law_cite data-id=&quot;outer&quot;&gt;&amp;lt;law_cite&amp;gt;${legalText}&amp;lt;/law_cite&amp;gt;&lt;/law_cite&gt;`,
          type: 'reason',
          index: 0,
        }],
        coverage_ratio: 1,
      }],
      visible: ['근로기준법 적용 조문', '섹션 고유 문구:', legalText],
      absent: ['섹션 대신 표시되면 안 되는 전체 본문', '선택되지 않은 수집 원문', '정리본 고유 문구:'],
    },
    {
      name: 'full_text_clean',
      documents: [{
        full_text_clean: `정제 본문 고유 문구: <law_cite data-id="clean"><law_cite>${legalText}</law_cite></law_cite>\n${filler}`,
        full_text_raw: `선택되지 않은 수집 원문\n${filler}`,
        body_sections: [],
        coverage_ratio: 1,
      }],
      visible: ['정제 본문 고유 문구:', legalText],
      absent: ['선택되지 않은 수집 원문', '정리본 고유 문구:'],
    },
    {
      name: 'full_text_raw',
      documents: [{
        full_text_clean: '너무 짧아 선택되지 않는 정제 본문',
        full_text_raw: `수집 원문 고유 문구: &amp;lt;law_cite data-id=&amp;quot;raw&amp;quot;&amp;gt;${legalText}&amp;lt;/law_cite&amp;gt;\n${filler}`,
        body_sections: [],
        coverage_ratio: 1,
      }],
      visible: ['수집 원문 고유 문구:', legalText],
      absent: ['너무 짧아 선택되지 않는 정제 본문', '정리본 고유 문구:'],
    },
    {
      name: 'holding_points fallback',
      documents: [],
      visible: ['서비스 내 정리본', '정리본 고유 문구:', legalText],
      absent: ['원본 본문'],
    },
  ])('preserves legal text through $name without mutating stored sources', async ({ documents, visible, absent }) => {
    database.documents = freezeDeep(structuredClone(documents));
    const storedBefore = structuredClone({ decision: database.decision, documents: database.documents });

    // The real source contract detects the bc_ route; neither it nor the renderer is mocked.
    const page = await DecisionPage({ params: Promise.resolve({ id: 'bc_annotation_fixture' }) });
    const html = renderToStaticMarkup(page);

    visible.forEach(text => expect(html).toContain(text));
    absent.forEach(text => expect(html).not.toContain(text));
    expect(html).toContain('판결요지의 법문도 보존한다.');
    expectNoAnnotations(html);
    expect(database.tables).toEqual(['cases', 'nlrc_decisions', 'decision_source_documents']);
    expect(database.filters).toContainEqual(['decision_source_documents', 'internal_decision_id', 'bc_annotation_fixture']);
    expect(database.filters).toContainEqual(['decision_source_documents', 'source_provider', 'bigcase']);
    expect({ decision: database.decision, documents: database.documents }).toEqual(storedBefore);
    expect(database.decision?.url).toBe(sourceUrl);
  });
});

describe('MarkdownSnippet renders annotations as legal text without enabling HTML', () => {
  it.each(['snippet', 'reading'] as const)('preserves nested, escaped citations and ordinary footnotes in %s mode', variant => {
    const fixture = freezeDeep({
      value: [
        '> <law_cite data-id="raw">원시 인용문: <law_cite>근로기준법 제23조</law_cite></law_cite>',
        '&lt;law_cite data-id=&quot;escaped&quot;&gt;단일 이스케이프 법문&lt;/law_cite&gt;',
        '&amp;lt;law_cite data-id=&amp;quot;double&amp;quot;&amp;gt;이중 이스케이프 법문&amp;lt;/law_cite&amp;gt;',
        '<law_cite>혼합 인용: &lt;law_cite&gt;내부 법문&lt;/law_cite&gt;</law_cite>',
        '각주를 확인합니다.[^qa] 같은 각주를 다시 확인합니다.[^qa]',
        `[원문 출처](${sourceUrl})`,
        '<law_cite><script>alert("raw-script")</script><img src="x" onerror="alert(1)">안전한 법문</law_cite>',
        '<law_cite>&lt;script&gt;alert("encoded-script")&lt;/script&gt;&lt;img src="x" onerror="alert(2)"&gt;</law_cite>',
        '[실행 불가 링크](javascript:alert%281%29)',
        '[^qa]: 일반 각주의 본문과 [참조 링크](https://example.invalid/footnote)를 보존한다.',
      ].join('\n\n'),
    });
    const originalValue = fixture.value;
    const html = renderToStaticMarkup(createElement(MarkdownSnippet, { value: fixture.value, variant }));

    for (const text of ['원시 인용문:', '근로기준법 제23조', '단일 이스케이프 법문', '이중 이스케이프 법문', '혼합 인용:', '내부 법문', '안전한 법문', '일반 각주의 본문과']) {
      expect(html).toContain(text);
    }
    expectNoAnnotations(html);
    expect(html).toContain('<blockquote');
    expect(html).not.toMatch(/<(?:script|img|iframe|svg)\b/i);
    expect(html).not.toMatch(/<[^>]*\son(?:error|load|click)=/i);
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toContain('node="[object Object]"');

    const sourceLink = html.match(/<a\b[^>]*href="https:\/\/example.invalid\/judgment\?[^\"]*"[^>]*>/)?.[0];
    expect(sourceLink).toContain(`href="${sourceUrl.replace(/&/g, '&amp;')}"`);
    expect(sourceLink).toContain('target="_blank"');
    expect(sourceLink).toContain('rel="noopener noreferrer"');

    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    const fragments = [...html.matchAll(/<a\b([^>]*href="#([^"]+)"[^>]*)>/g)];
    expect(fragments).toHaveLength(4);
    for (const [, attributes, target] of fragments) {
      expect(ids.has(decodeURIComponent(target)), `Missing footnote target: ${target}`).toBe(true);
      expect(attributes).not.toContain('target="_blank"');
    }
    for (const [, label] of html.matchAll(/aria-describedby="([^"]+)"/g)) {
      expect(ids.has(label), `Missing footnote description: ${label}`).toBe(true);
    }
    expect(html).toContain('class="sr-only"');
    expect(fixture.value).toBe(originalValue);
  });
});
