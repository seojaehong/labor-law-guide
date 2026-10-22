import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const rules = JSON.parse(fs.readFileSync('public/data/laws/rules.json', 'utf8')).rules as {
  lawId: string; article: string; topic: string; clause: string;
}[];
const src = fs.readFileSync('src/app/laws/RulesCheck.tsx', 'utf8');

describe('제안 문안은 최저 기준이라는 것이 따라붙는다', () => {
  // 2026-10-21 실사용 검토: 육아기 단축 3년을 주던 회사가 제안 문안(1년+α)으로 깎였다.
  it('화면과 복사본 양쪽에 경고가 붙는다', () => {
    expect(src).toContain('export const FLOOR_NOTE');
    expect(src).toMatch(/근로기준법 제94조제1항 단서의 불이익 변경/);
    // 복사되는 본문 두 경로 모두에 들어가야 한다
    expect(src.match(/\$\{FLOOR_NOTE\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // 화면에도 보인다
    expect(src).toContain('{FLOOR_NOTE}</p>');
  });
});

describe('육아휴직 제안 문안', () => {
  // 법 제19조① 「(입양한 자녀를 포함한다. 이하 같다)」 — 법제처 원문 대조(2026-10-21)
  it('입양한 자녀를 빠뜨리지 않는다', () => {
    const r = rules.find(x => x.lawId === '000130' && x.article === '제19조' && x.topic.includes('사유 확대'));
    expect(r, '육아휴직 사유 확대 규칙').toBeTruthy();
    expect(r!.clause).toContain('입양한 자녀를 포함한다');
  });

  it('만 8세·초등 2학년을 쓰는 다른 육아휴직 문안도 같이 본다', () => {
    const targets = rules.filter(x => x.lawId === '000130' && /육아휴직/.test(x.topic) && /만 8세/.test(x.clause));
    expect(targets.length).toBeGreaterThan(0);
    const missing = targets.filter(x => !x.clause.includes('입양')).map(x => `${x.article} ${x.topic}`);
    expect(missing, '입양 문구가 빠진 육아휴직 문안').toEqual([]);
  });
});
