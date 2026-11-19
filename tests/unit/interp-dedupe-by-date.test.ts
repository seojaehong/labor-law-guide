// 261119 — 같은 문서번호를 다른 해에 다시 쓴 별개 회시(번호 재사용)가 목록에서 하나로 합쳐지면 안 된다.
// 중복 키 = 표시용 번호 + 회신일. 띄어쓰기만 다른 같은 문서(같은 날짜)는 여전히 하나로 줄인다.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { adminDedupeKey, dedupeResults } from '@/app/database/_components/utils';

it('번호가 같아도 회신일이 다르면 둘 다 남는다', () => {
  const rows = [
    { id: '고용서비스정책과-1811', doc_number: '고용서비스정책과-1811', summary: 'a', decision_date: '2010-03-26', title: 'a' },
    { id: '고용서비스정책과-1811 (2012-04-05)', doc_number: '고용서비스정책과-1811', summary: 'b', decision_date: '2012-04-05', title: 'b' },
  ];
  expect(dedupeResults(rows, adminDedupeKey)).toHaveLength(2);
});

it('띄어쓰기만 다르고 날짜가 같으면 하나로 줄어든다', () => {
  const rows = [
    { id: '산안 68320-380', doc_number: '산안 68320-380', summary: '요지', decision_date: '2003-09-29', title: 'a' },
    { id: '산안68320-380', doc_number: '산안68320-380', summary: '요지', decision_date: '2003-09-29', title: 'a' },
  ];
  expect(dedupeResults(rows, adminDedupeKey)).toHaveLength(1);
});

it('행정해석 목록은 adminDedupeKey 로 거른다', () => {
  expect(readFileSync('src/app/database/DatabaseClient.tsx', 'utf8')).toContain('dedupeResults(typed, adminDedupeKey)');
});
