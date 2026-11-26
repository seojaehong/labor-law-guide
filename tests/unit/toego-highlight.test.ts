// 퇴고 체험 — 엔진 걸림(줄·칸·길이)을 원문 위치로 옮기는 화면 쪽 계산.
// 검사마다 줄 나누는 법이 다르다: 문체·쉼표 = \r\n|\r|\n, 띄어쓰기·문장 부호 = 파이썬 splitlines(\v \f \x1c-\x1e \x85 U+2028 U+2029 도 줄 나눔).
// 칸·길이는 코드포인트다. 원문에서 잘라 낸 조각이 엔진이 걸린 글자와 같아야 한다.
import { describe, expect, it } from 'vitest';
import { runToegoBrowser } from '../../src/lib/toego/entry.mjs';
import { CHECKS, collectMarks, hitRange, segments } from '../../src/lib/toego/highlight';
import { CORPUS } from '../fixtures/toego/corpus';

const GENRES = ['legal', 'consulting', 'lecture', 'general', 'official'] as const;
const cpHead = (s: string, n: number) => [...s].slice(0, n).join('');

describe('걸림 → 원문 위치', () => {
  it('모든 걸림에서 원문 조각 = 엔진이 걸린 글자(문체는 24자까지)', () => {
    let n = 0;
    for (const text of CORPUS) {
      for (const genre of GENRES) {
        const r = runToegoBrowser({ text, genre });
        if (!r.ok) continue;
        for (const check of CHECKS) {
          const hits = check === 'prose' ? r.prose.hits : r.norms[check].hits;
          for (const h of hits) {
            const { start, end } = hitRange(text, check, h);
            const piece = text.slice(start, end);
            expect([...piece].length, `${check} ${h.line}:${h.col}`).toBe(h.len);
            expect(check === 'prose' ? cpHead(piece, 24) : piece, `${check} ${h.line}:${h.col}`).toBe(h.word);
            n++;
          }
        }
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('이모지·U+2028·\\f·CRLF·CR 뒤의 줄도 맞춘다', () => {
    const text = '😀𝟘 할수 있다\r\n둘째 줄 할수\u2028셋째 줄 제 3조\f넷째 줄 ( 괄호 )\r다섯째 줄 할수 있는 것';
    const r = runToegoBrowser({ text, genre: 'general' });
    const marks = collectMarks(text, r);
    const pieces = marks.map((m) => `${m.check}:${text.slice(m.start, m.end)}`);
    expect(pieces).toContain('spacing:할수');
    expect(pieces).toContain('spacing:제 3');
    expect(pieces).toContain('punct:( ');
    expect(pieces).toContain('punct: )');
    // 마지막 줄(CR 뒤)의 「할수」 자리
    const last = text.lastIndexOf('할수');
    expect(marks.some((m) => m.check === 'spacing' && m.start === last)).toBe(true);
  });

  it('조각 나누기 — 이어 붙이면 원문 그대로, 겹친 걸림은 한 조각에 함께', () => {
    for (const text of CORPUS) {
      const r = runToegoBrowser({ text, genre: 'legal' });
      if (!r.ok) continue;
      const marks = collectMarks(text, r);
      const segs = segments(text, marks);
      expect(segs.map((s) => s.text).join('')).toBe(text);
      for (const s of segs) {
        for (const id of s.marks) {
          const m = marks[id];
          expect(m.start <= s.start && s.start + s.text.length <= m.end).toBe(true);
        }
      }
    }
    const text = '가나다라마';
    const fake = [
      { check: 'prose', start: 1, end: 4, grade: 'B' },
      { check: 'spacing', start: 2, end: 3, grade: 'A' },
    ] as never;
    expect(segments(text, fake).map((s) => [s.text, s.marks])).toEqual([['가', []], ['나', [0]], ['다', [0, 1]], ['라', [0]], ['마', []]]);
  });

  it('엔진이 원문 밖을 가리키면 원문 끝에서 자른다(화면이 깨지지 않게)', () => {
    expect(hitRange('가나', 'spacing', { line: 9, col: 1, len: 3 } as never)).toEqual({ start: 2, end: 2 });
    expect(hitRange('가나', 'spacing', { line: 1, col: 2, len: 9 } as never)).toEqual({ start: 1, end: 2 });
  });
});
