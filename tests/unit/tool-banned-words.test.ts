import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bannedHits } from '@/lib/tool-kit/banned';

// 도구 화면 소스의 글자(JSX 글자·문자열·정적 HTML)에 금지어가 없는지 본다. 주석은 빼고 본다.
// 첫 화면과 고정 문구를 지키는 시험이다. 계산 결과 문장은 도구마다 copy 시험이 allCopy 로 훑는다.

const ROOTS = [
  'src/app/tools',
  'src/app/duties',
  'src/app/exit-employer',
  'src/components/tool',
  'src/components/leave',
  'src/components/BizNoLookup.tsx',
  'src/components/biz-no-lookup-copy.ts',
  'src/components/HolidayPayCalculator.tsx',
  'src/content/tools-registry.ts',
  'src/lib/calc',
  'src/content/duties-data.ts',
  'public/tools/severance.html',
];

function files(p: string): string[] {
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return [p];
  return fs.readdirSync(p).flatMap((n) => files(path.join(p, n))).filter((f) => /\.(tsx?|html)$/.test(f));
}

/** 주석을 지운다 — /* *\/ · {/* *\/} · <!-- --> · 줄 끝 // (주소의 // 는 남긴다) */
function stripComments(src: string): string {
  // 여러 줄 주석은 줄 수만큼 빈 줄로 바꿔 줄 번호를 지킨다
  const blank = (m: string) => '\n'.repeat(m.split('\n').length - 1);
  return src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:'"`\w])\/\/.*$/, '$1'))
    .join('\n');
}

describe('도구 화면 금지어', () => {
  const all = ROOTS.flatMap(files);

  it('살펴볼 파일을 찾는다', () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it('주석을 뺀 글자에 금지어가 없다', () => {
    const found = all.flatMap((f) =>
      stripComments(fs.readFileSync(f, 'utf8'))
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, hits: bannedHits(line), line: line.trim().slice(0, 80) }))
        .filter((x) => x.hits.length),
    );
    expect(found.map((x) => `${x.f}:${x.i} ${x.hits.join(',')} | ${x.line}`)).toEqual([]);
  });
});

describe('bannedHits', () => {
  it('허용 구절은 걸지 않는다', () => {
    expect(bannedHits('전자문서로 줍니다. 고충상담 절차')).toEqual([]);
  });
  it('표방어와 단정어를 잡는다', () => {
    expect(bannedHits('노무사 상담을 권장합니다')).toEqual(['노무사', '상담']);
    expect(bannedHits('임금 체불입니다')).toEqual(['체불']);
  });
});
