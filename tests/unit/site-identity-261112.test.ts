// 261112 재홍님 결정(「추천안대로」) — 사이트는 「노동법 계산·점검 도구 + AI 연결(MCP) + 정보」 순이다.
// 「노동법 AI」「AI 질의응답」으로 소개하지 않고, 노란봉투법은 주제 페이지(/guide /manual /checklist /cases /news)의
// 주제일 뿐 사이트 이름이 아니다. 주제 페이지 밖에서 그 틀이 되살아나지 않게 막는다.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f: string) => fs.readFileSync(f, 'utf8');
/** dirs 아래 .ts/.tsx 에서 정규식에 걸린 줄을 「파일:줄번호: 내용」으로 돌려준다. */
function grepLines(dirs: string[], re: RegExp): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) read(p).split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${p}:${i + 1}: ${line.trim()}`); });
    }
  };
  dirs.forEach(walk);
  return hits;
}
const AI_ENTRY = [
  'public/llms.txt', 'public/llms-full.txt', 'public/.well-known/agent-card.json',
  'public/.well-known/agent-skills/index.json', 'public/.well-known/agent-skills/labor-law-guide/SKILL.md',
];

describe('사이트 정체성 — 노란봉투법·AI 질의응답 틀 걷어내기', () => {
  it('AI 가 읽는 입구 파일은 /ai 를 「AI 질의응답」으로 소개하지 않는다', () => {
    for (const f of AI_ENTRY) expect(read(f), f).not.toMatch(/AI 질의응답|AI가 근거와 함께 답|AI에게 질문/);
    const card = JSON.parse(read('public/.well-known/agent-card.json'));
    expect(card.skills.map((s: { id: string }) => s.id)).not.toContain('ai-qna');
  });

  it('입구 파일의 머리(제목·소개)는 노란봉투법으로 시작하지 않는다', () => {
    const full = read('public/llms-full.txt').split('\n');
    expect(full[0]).not.toMatch(/노란봉투/);
    const card = JSON.parse(read('public/.well-known/agent-card.json'));
    expect(card.description.split('.')[0]).not.toMatch(/노란봉투/);
    const skills = JSON.parse(read('public/.well-known/agent-skills/index.json'));
    expect(skills.skills[0].description.split('—')[0]).not.toMatch(/노란봉투/);
    expect(read('public/.well-known/agent-skills/labor-law-guide/SKILL.md')).not.toMatch(/^description:.*노란봉투/m);
    const intro = read('public/llms.txt').split('\n').find(l => l.startsWith('> '))!;
    expect(intro.indexOf('도구')).toBeGreaterThan(-1);
    expect(intro.indexOf('도구')).toBeLessThan(intro.indexOf('노란봉투법'));
  });

  it('/ai 와 /database 메타데이터는 노란봉투법·AI 질의응답 이름을 쓰지 않는다', () => {
    const ai = read('src/app/ai/layout.tsx');
    expect(ai).toContain('근거 자료 찾기');
    expect(ai).toContain('index: false');
    expect(ai).not.toMatch(/title:.*(노란봉투|질의응답)/);
    expect(read('src/app/database/layout.tsx')).not.toMatch(/노란봉투/);
  });

  it('src/app 에 「노란봉투법 가이드」 브랜드가 코드 값으로 남지 않는다(주석만 허용)', () => {
    const out = grepLines(['src/app'], /노란봉투법 가이드/).filter(line => !/:\d+: (\/\/|\{\/\*|\*)/.test(line));
    expect(out).toEqual([]);
  });

  it('FAQ 분류 설명에 검수 주장을 쓰지 않는다', () => {
    expect(read('src/app/faq/[category]/page.tsx')).not.toMatch(/description:.*노무사가 검수/);
  });

  it('근로계약서 점검 소개는 「점검·확인」 말로 쓴다(엔진 출력 라벨은 그대로)', () => {
    expect(read('src/content/tools-registry.ts')).not.toMatch(/위반·리스크별 수정 방향 제시/);
    expect(read('src/content/ai-tools.ts')).not.toMatch(/위반·리스크·적정/);
  });

  it('사이트 화면이 /ai 로 보내며 「AI에게 질문」·「AI 노동법 상담」을 약속하지 않는다', () => {
    const hits = grepLines(['src/app', 'src/components'], /AI에게 (질문|바로 물어|해석 물어)|AI 노동법 상담|AI 질의응답/)
      .filter(line => !/:\d+: (\/\/|\{\/\*|\*)/.test(line));
    expect(hits).toEqual([]);
  });
});
