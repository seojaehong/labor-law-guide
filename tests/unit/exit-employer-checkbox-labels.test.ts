import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ExitEmployerClient from '../../src/app/exit-employer/ExitEmployerClient';

// 261112 점검 — 「처리했습니다」 체크칸이 모두 같은 이름이라 화면 낭독기로는 어느 단계인지 알 수 없었다.
describe('exit-employer step checkboxes', () => {
  const html = renderToStaticMarkup(createElement(ExitEmployerClient));
  const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];

  it('renders the step checkboxes', () => {
    expect(boxes.length).toBeGreaterThanOrEqual(10);
  });

  it('gives every checkbox an id, a <label for>, and a name made of its step title plus 「처리했습니다」', () => {
    for (const box of boxes) {
      const id = box.match(/\bid="([^"]+)"/)?.[1];
      expect(id, box).toBeTruthy();
      expect(html).toContain(`for="${id}"`);
      const ids = box.match(/aria-labelledby="([^"]+)"/)?.[1].split(' ') ?? [];
      expect(ids, box).toHaveLength(2);
      const title = html.match(new RegExp(`<[^>]+id="${ids[0]}"[^>]*>([^<]+)<`))?.[1];
      const action = html.match(new RegExp(`<[^>]+id="${ids[1]}"[^>]*>([^<]+)<`))?.[1];
      expect(title?.trim(), box).toBeTruthy();
      expect(action).toBe('처리했습니다');
    }
    const titles = boxes.map(b => b.match(/aria-labelledby="([^" ]+)/)?.[1]);
    expect(new Set(titles).size).toBe(boxes.length);
  });
});

describe('laws search input', () => {
  it('keeps the 「개정 검색」 name and declares the 「/」 shortcut on the input itself', () => {
    const src = readFileSync('src/app/laws/LawsClient.tsx', 'utf8');
    const input = src.match(/<input\s+ref=\{searchRef\}[\s\S]*?\/>/)?.[0] ?? '';
    expect(input).toContain('aria-label="개정 검색"');
    expect(input).toContain('aria-keyshortcuts="/"');
  });
});
