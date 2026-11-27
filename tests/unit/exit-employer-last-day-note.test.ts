import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ExitEmployerClient from '../../src/app/exit-employer/ExitEmployerClient';
import { LAST_DAY_NOTE } from '@/content/exit-employer-data';
import { bannedHits } from '@/lib/tool-kit/banned';

// G4 261126 I27 — 퇴사 체크리스트의 「마지막 근무일」이 건보 신고서로 그대로 넘어간다.
// 마지막 출근일을 넣으면 상실일이 앞당겨진다(금 마지막 출근·일요일까지 근로관계 → 상실일 21일, 맞는 값 23일).
// 날짜 칸과 신고서 버튼 앞 두 곳에 「근로관계가 이어진 마지막 날」을 밝힌다.
describe('퇴사 체크리스트 — 마지막 근무일 뜻', () => {
  const html = renderToStaticMarkup(createElement(ExitEmployerClient));

  it('근로관계가 이어진 마지막 날이고 마지막 출근일과 다를 수 있다고 적는다', () => {
    expect(LAST_DAY_NOTE).toContain('근로관계가 이어진 마지막 날');
    expect(LAST_DAY_NOTE).toContain('마지막 출근');
    expect(bannedHits(LAST_DAY_NOTE)).toEqual([]);
  });

  it('날짜 칸 바로 아래와 건보 신고서 버튼 앞에 같은 설명이 있다', () => {
    const at = (s: string, from = 0) => html.indexOf(s, from);
    const field = at('마지막 근무일 <b>필수</b>');
    const note1 = at(LAST_DAY_NOTE, field);
    expect(field).toBeGreaterThan(-1);
    expect(note1).toBeGreaterThan(field);
    expect(note1).toBeLessThan(at('입사일', field));
    const button = at('data-step-tool="hi-loss"');
    expect(button).toBeGreaterThan(-1);
    const note2 = html.lastIndexOf(LAST_DAY_NOTE, button);
    expect(note2).toBeGreaterThan(at('건강보험 직장가입자 자격상실 신고'));
  });

  it('날짜 칸 이름은 「마지막 근무일」만, 설명은 따로 읽힌다(label 안 설명문이 칸 이름에 붙지 않게)', () => {
    const input = html.match(/<input type="date"[^>]*aria-describedby="ee-last-day-note"[^>]*>/)?.[0] ?? '';
    expect(input).toContain('aria-labelledby="ee-last-day-k"');
    expect(html).toMatch(/<span class="k" id="ee-last-day-k">마지막 근무일 <b>필수<\/b><\/span>/);
  });
});
