import { describe, expect, it } from 'vitest';
import { readPrefill, nhisLossHref } from '@/lib/nhis-forms/prefill';
import { STEPS } from '@/content/exit-employer-data';
import { TOOLS } from '@/content/tools-registry';

// /exit-employer → /tools/nhis-report-form 연결(퇴사 한 번에, 조각 0).
// 값은 주소의 # 뒤(해시)에 싣는다 — 해시는 서버 요청·Referer 에 실리지 않아 「서버로 보내지 않는다」 안내가 참으로 남는다.
describe('신고서 도구 해시 값 읽기', () => {
  it('상실 + 마지막 근무일을 읽는다', () => {
    expect(readPrefill('#kind=loss&last=2026-10-31')).toEqual({ last: '2026-10-31' });
  });
  it('날짜가 틀리면 날짜는 버린다', () => {
    expect(readPrefill('#kind=loss&last=2026-02-30')).toEqual({});
    expect(readPrefill('#kind=loss&last=abc')).toEqual({});
  });
  it('상실이 아니면 읽지 않는다(취득은 만드는 곳이 없다)', () => {
    expect(readPrefill('#kind=acq&last=2026-10-31')).toBeNull();
    expect(readPrefill('#kind=xyz&last=2026-10-31')).toBeNull();
    expect(readPrefill('')).toBeNull();
    expect(readPrefill('#')).toBeNull();
  });
  it('개인정보 칸은 읽지 않는다', () => {
    expect(readPrefill('#kind=loss&last=2026-10-31&name=홍길동&rrn=9001011234567')).toEqual({ last: '2026-10-31' });
  });
});

describe('퇴사 체크리스트에서 신고서로 가는 주소', () => {
  it('마지막 근무일을 해시에 싣는다 — ? 뒤에는 아무것도 없다', () => {
    const href = nhisLossHref('2026-10-31');
    expect(href).toBe('/tools/nhis-report-form#kind=loss&last=2026-10-31');
    expect(href).not.toContain('?');
  });
  it('마지막 근무일이 없거나 틀리면 종류만', () => {
    expect(nhisLossHref('')).toBe('/tools/nhis-report-form#kind=loss');
    expect(nhisLossHref('2026-13-01')).toBe('/tools/nhis-report-form#kind=loss');
  });
  it('주고받은 값이 그대로 돌아온다', () => {
    const href = nhisLossHref('2026-12-31');
    expect(readPrefill(href.slice(href.indexOf('#')))).toEqual({ last: '2026-12-31' });
  });
});

describe('퇴사 체크리스트 항목의 도구 연결', () => {
  const withTool = STEPS.filter(s => s.tool);
  it('다섯 항목에 도구가 붙어 있다', () => {
    expect(withTool.map(s => s.id).sort()).toEqual(['annual-pay', 'hi-loss', 'retire-tax', 'severance', 'year-end']);
  });
  it('모든 주소가 도구 목록에 있는 도구다', () => {
    const known = new Set(TOOLS.map(t => t.href));
    for (const s of withTool) expect(known.has(s.tool!.href), `${s.id} → ${s.tool!.href}`).toBe(true);
  });
  it('마지막 근무일을 넘기는 것은 상실신고서 하나뿐이다', () => {
    expect(withTool.filter(s => s.tool!.passLastDay).map(s => s.id)).toEqual(['hi-loss']);
  });
  it('상실신고서 버튼은 도구가 쓰는 문서 이름(사업주확인서)을 쓴다', () => {
    expect(STEPS.find(s => s.id === 'hi-loss')!.tool!.label).toContain('사업주확인서');
  });
});
