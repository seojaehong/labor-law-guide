// 퇴고 소개 화면의 글 — 금지어·단정 표현이 없고, 예시는 합성 글이며, 화면 문장도 공개 규범(띄어쓰기·문장 부호·쉼표) A 걸림이 없다.
import { describe, expect, it } from 'vitest';
import { bannedHits } from '../../src/lib/tool-kit/banned';
import { GENERIC_INFO, runToegoBrowser } from '../../src/lib/toego/entry.mjs';
import * as COPY from '../../src/app/tools/toego/copy';

type Hit = { word: string; basis?: string; grade: string };
const hitsOf = (text: string, check: 'prose' | 'spacing' | 'punct' | 'comma', genre = 'general'): Hit[] => {
  const r = runToegoBrowser({ text, genre });
  expect(r.ok, text).toBe(true);
  return check === 'prose' ? r.prose.hits : r.norms[check].hits;
};

const all = JSON.stringify(COPY);

describe('퇴고 화면 글', () => {
  it('사이트 금지어가 없다(banned.ts)', () => {
    expect(bannedHits(all)).toEqual([]);
  });

  it('글쓴이를 가려낸다거나 결과를 보증하는 말을 쓰지 않는다', () => {
    for (const w of ['AI가 썼', '사람이 썼', 'AI가 쓴', '사람이 쓴', '검증 완료', '검증된', '적중', '정확도', '%']) expect(all, w).not.toContain(w);
  });

  it('아직 들어오지 않은 검사를 적지 않는다', () => {
    for (const w of ['보존 검사', '보존 대조', 'check_rewrite', 'check_semantic', 'check_rhetoric']) expect(all, w).not.toContain(w);
  });

  it('예시 글에 주민등록번호 모양이 없다 — 체험 버튼이 멈춤 화면을 내지 않는다', () => {
    for (const e of COPY.EXAMPLES) {
      const r = runToegoBrowser({ text: e.text, genre: e.genre });
      expect(r.ok, e.label).toBe(true);
    }
  });

  it('고치기 전·후 — 「바꾼 곳」 줄마다 그 검사가 실제로 걸린다', () => {
    const { before, genre, changes } = COPY.BEFORE_AFTER;
    expect(changes).toHaveLength(4);
    const prose = hitsOf(before, 'prose', genre).map((h) => h.word);
    expect(changes[0]).toContain('현장의 숨결');
    expect(prose).toContain('현장의 숨결');
    expect(prose.some((w) => w.includes('사이의 틈을'))).toBe(true);
    expect(changes[1]).toContain('확인하였고,');
    expect(hitsOf(before, 'comma', genre).map((h) => h.word)).toContain('확인하였고,');
    expect(changes[2]).toContain('검토할수');
    expect(hitsOf(before, 'spacing', genre).map((h) => h.word)).toContain('할수');
    expect(changes[3]).toContain('있다 .');
    expect(hitsOf(before, 'punct', genre).map((h) => h.word)).toContain('다 .');
  });

  it('「무엇을 찾나」의 설명이 엔진 규칙과 맞는다(합성 조각마다 걸림·근거)', () => {
    const [prose, spacing, punct, comma] = COPY.WHAT_WE_CATCH;
    // 문체 — 공개 사전 판·항목 수, 예로 든 두 표현
    expect(prose.source).toContain(`${GENERIC_INFO.ruleCount}항목`);
    expect(GENERIC_INFO.version).toContain(prose.source.match(/v(\d+\.\d+)/)![1]);
    for (const w of ['정보에 입각한 판단', '단단한 토대']) {
      expect(prose.body).toContain(w);
      expect(hitsOf(`회사는 ${w}을 바란다.`, 'prose').length, w).toBeGreaterThan(0);
    }
    // 「일부 항목은 법률·컨설팅·강의안에서만」 — 같은 글이 일반·공문에서는 덜 걸린다
    expect(prose.source).toContain('법률·컨설팅·강의안에서만');
    const scene = '일터의 풍경을 천천히 들여다본다.';
    const words = (g: string) => hitsOf(scene, 'prose', g).map((h) => h.word).sort();
    for (const g of ['legal', 'consulting', 'lecture']) expect(words(g).length, g).toBeGreaterThan(words('general').length);
    expect(words('official')).toEqual(words('general'));
    // 띄어쓰기 — 및·수밖에·제-·수·것·등·만 단위, 근거는 제41~45항
    expect(spacing.source).toContain('제41~45항');
    const sp: [string, string][] = [
      ['인사팀및 총무팀', '제45항'], ['할 수 밖에 없다', '제41항'], ['제 3조', '제43항 다만'], ['검토할수 있다', '제42항'],
      ['하는것이 좋다', '제42항'], ['책상·의자등이 있다', '제45항'], ['3억5000만 원', '제44항'],
    ];
    for (const [t, basis] of sp) expect(hitsOf(t, 'spacing').map((h) => h.basis), t).toContain(basis);
    // 문장 부호 — 쉼표·마침표·쌍점·괄호·따옴표 앞뒤, 줄임표, 모점, 가운뎃점과 쉼표
    for (const t of ['가나 , 다라', '끝이다 .', '근거 : 법', '법 ( 시행 )', '그는 “ 예”라고', '이어서...', '가、나', '인사ㆍ노무, 회계ㆍ재무']) {
      expect(hitsOf(t, 'punct').length, t).toBeGreaterThan(0);
    }
    // 연결어미 뒤 쉼표 — 「~하였고,」「~경우,」는 걸리고 「경고, 견책」은 두며 근거는 규정이 아니라 관행
    expect(comma.body).toContain('경고, 견책');
    expect(hitsOf('회사는 이를 검토하였고, 결론을 냈다.', 'comma').length).toBe(1);
    expect(hitsOf('지각한 경우, 경위서를 받는다.', 'comma').length).toBe(1);
    expect(hitsOf('징계는 경고, 견책, 감봉으로 나뉜다.', 'comma')).toEqual([]);
    expect(hitsOf('검토하였고, 결론', 'comma')[0].basis).toBe('연결어미 뒤 쉼표');
    expect(punct.source).toContain('문장 부호');
    // 등급 안내 — 반드시 교정의 근거를 검사마다 맞게 적는다(쉼표 A 는 규정이 아니라 관행)
    expect(hitsOf('검토하였고, 결론', 'comma')[0].grade).toBe('A');
    expect(COPY.TRIAL.gradeNote).toContain('쉼표는 업무 문서 관행');
  });

  it('화면 문장은 공개 규범 A 걸림이 없다(예시 글은 빼고)', () => {
    const rest = Object.fromEntries(Object.entries(COPY).filter(([k]) => k !== 'EXAMPLES' && k !== 'BEFORE_AFTER'));
    const prose = JSON.stringify(rest).replace(/\\n/g, '\n').split(/","|":"|\["|"\]|\{"|"\}/).filter((s) => /[가-힣]/.test(s)).join('\n');
    const r = runToegoBrowser({ text: prose, genre: 'general' });
    expect(r.ok).toBe(true);
    for (const k of ['spacing', 'punct', 'comma'] as const) {
      expect(r.norms[k].hits.filter((h: { grade: string }) => h.grade === 'A').map((h: { word: string; reason: string }) => `${h.word} — ${h.reason}`), k).toEqual([]);
    }
  });
});
