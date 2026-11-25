import { describe, expect, it } from 'vitest';
import { themeAuthoredStyle } from '@/lib/blog-authored-style';

// 실제 글 본문(운영 표본 300건, 261124)에서 뽑은 inline style 그대로다.
const CALLOUT = { margin: '24px 0', padding: '18px 22px', background: '#f5f2ea', borderLeft: '4px solid #2F5D43', borderRadius: '4px', color: '#181816' };

describe('글 본문에 박힌 색을 테마 토큰으로 바꾼다', () => {
  it('강조 상자(div 배경 #f5f2ea)는 고정 색을 버리고 blog-callout 클래스로 간다', () => {
    const r = themeAuthoredStyle('div', CALLOUT);
    expect(r.className).toBe('blog-callout');
    const s = r.style ?? {};
    for (const k of ['background', 'backgroundColor', 'color', 'borderLeft', 'borderRadius']) expect(s).not.toHaveProperty(k);
  });

  it('배경 없는 div 는 손대지 않는다', () => {
    expect(themeAuthoredStyle('div', { textAlign: 'center' })).toEqual({ style: { textAlign: 'center' } });
  });

  it('밝은 행 배경(#fff·#fafafa·#f9fafb)은 중립 행 토큰으로', () => {
    for (const bg of ['#fff', '#fafafa', '#f9f9f7', '#f9fafb', '#f5f5f5']) {
      const r = themeAuthoredStyle('tr', { background: bg });
      expect(r.className).toBe('blog-row-muted');
      expect(r.style ?? {}).not.toHaveProperty('background');
    }
  });

  it('붉은 행 배경(#fef2f2)은 위험 틴트 토큰으로', () => {
    const r = themeAuthoredStyle('tr', { background: '#fef2f2' });
    expect(r.className).toBe('blog-row-danger');
  });

  it('진한 머리 행(#2F5D43 + 흰 글자)은 그대로 두고 칸 글자색이 행을 따르게 한다', () => {
    const r = themeAuthoredStyle('tr', { background: '#2F5D43', color: '#fff' });
    expect(r.className).toBe('blog-row-inverse');
    expect(r.style).toMatchObject({ background: '#2F5D43', color: '#fff' });
  });

  it('칸 글자색은 의미색 잉크 토큰으로, 고정 테두리 색은 경계 토큰으로', () => {
    const cases: Array<[string, string]> = [
      ['#dc2626', 'var(--color-danger-ink)'],
      ['#b91c1c', 'var(--color-danger-ink)'],
      ['#16a34a', 'var(--color-success-ink)'],
      ['#2F5D43', 'var(--color-success-ink)'],
      ['#d97706', 'var(--color-warn-ink)'],
      ['#181816', 'var(--color-text-primary)'],
    ];
    for (const [authored, token] of cases) {
      const r = themeAuthoredStyle('td', { padding: '9px 12px', border: '1px solid #ddd', color: authored });
      expect(r.style).toMatchObject({ padding: '9px 12px', border: '1px solid var(--color-border)', color: token });
    }
    const b = themeAuthoredStyle('td', { borderBottom: '1px solid #e5e7eb', textAlign: 'center' });
    expect(b.style).toMatchObject({ borderBottom: '1px solid var(--color-border)', textAlign: 'center' });
  });

  // 운영 전수(1,142건) 조사에서 나온 드문 패턴
  it('노란 행(#fef3c7)은 주의 틴트, 옅은 초록·파랑·회색 행은 중립', () => {
    expect(themeAuthoredStyle('tr', { background: '#fef3c7' }).className).toBe('blog-row-warn');
    for (const bg of ['#e8f5e9', '#f0f4ff', '#f0f4f8', '#f4f4f4', '#f1f3f5']) expect(themeAuthoredStyle('tr', { background: bg }).className, bg).toBe('blog-row-muted');
  });

  it('배경 없는 div 의 고정 글자색도 잉크 토큰으로(다크에서 어두운 글자 방지)', () => {
    expect(themeAuthoredStyle('div', { color: '#0f172a' }).style).toEqual({ color: 'var(--color-text-primary)' });
    expect(themeAuthoredStyle('div', { color: '#475569' }).style).toEqual({ color: 'var(--color-text-secondary)' });
    expect(themeAuthoredStyle('div', { color: '#92400e' }).style).toEqual({ color: 'var(--color-warn-ink)' });
  });

  it('그라디언트 배경 상자도 강조 상자로', () => {
    expect(themeAuthoredStyle('div', { background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' }).className).toBe('blog-callout');
  });

  it('style 이 없으면 빈 결과', () => {
    expect(themeAuthoredStyle('td', undefined)).toEqual({});
  });
});
