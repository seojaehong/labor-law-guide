// 261119 #218 조각 5·6 — 같은 행정해석이 띄어쓰기만 달리 두 번 들어가 있었다(「산안 68320-380」/「산안68320-380」).
// 목록은 번호를 한 모양으로 보이고, 그 모양으로 중복을 거른다. 상세 주소(id)는 그대로 둔다.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { displayDocNumber, dedupeResults } from '@/app/database/_components/utils';

it.each([
  ['산안 68320-380', '산안68320-380'],
  ['산안(건안) 68307-10515', '산안(건안)68307-10515'],
  ['근로기준정책과－2858', '근로기준정책과-2858'],
  ['노사관계법제과 - 1233', '노사관계법제과-1233'],
  ['근로기준정책과-2858', '근로기준정책과-2858'],
])('displayDocNumber(%s) = %s', (raw, want) => expect(displayDocNumber(raw)).toBe(want));

it('빈 번호는 빈 문자열', () => {
  expect(displayDocNumber(null)).toBe('');
  expect(displayDocNumber(undefined)).toBe('');
});

it('정규화 번호로 중복을 거르면 띄어쓰기만 다른 쌍이 하나로 줄어든다', () => {
  const rows = [
    { id: '산안 68320-380', doc_number: '산안 68320-380', summary: '요지', decision_date: '2003-09-29', title: 'a' },
    { id: '산안68320-380', doc_number: '산안68320-380', summary: '요지', decision_date: '2003-09-29', title: 'a' },
  ];
  expect(dedupeResults(rows, r => displayDocNumber(r.doc_number) || r.id)).toHaveLength(1);
});

it('목록 화면은 표시용 번호를 쓰고, 직접 조회는 중복 표시 행을 뺀다', () => {
  const card = readFileSync('src/app/database/_components/AdminCard.tsx', 'utf8');
  const client = readFileSync('src/app/database/DatabaseClient.tsx', 'utf8');
  expect(card).toContain('displayDocNumber(item.doc_number)');
  expect(client).toContain("displayDocNumber(item.doc_number)");
  expect(client).toMatch(/from\('admin_interpretations'\)[\s\S]{0,300}\.is\('duplicate_of', null\)/);
});
