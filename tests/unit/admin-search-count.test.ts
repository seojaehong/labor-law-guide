// 261119 — 행정해석 검색이 문서번호·부분일치를 찾게 되면서(search_admin_core), 「총 N건」도 같은 조건으로 세야 한다.
// 화면의 ILIKE 세기는 문서번호를 못 보고(번호 검색 → 「총 0건」) 본문을 전수 스캔했다.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const client = readFileSync('src/app/database/DatabaseClient.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20261119b_admin_search_number_substring.sql', 'utf8');

it('행정해석 탭의 총건수는 search_admin_count RPC 로 센다', () => {
  expect(client).toMatch(/rpc\('search_admin_count',\s*\{\s*query:\s*rpcQuery\s*\}\)/);
});

it('목록과 건수는 같은 조건(admin_search_where)을 쓴다', () => {
  expect(migration.match(/admin_search_where\(use_num, longest IS NOT NULL\)/g)).toHaveLength(2);
});

it('키워드 조건은 색인을 타는 @> 형태(= ANY 는 OR 전체를 전수 스캔으로 만든다)', () => {
  expect(migration).toContain('a.keywords_matched @> ARRAY[$3]');
  expect(migration).not.toMatch(/=\s*ANY\(a\.keywords_matched\)/);
});
