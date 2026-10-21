import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readHwpText } from '@/lib/laws/hwp-read';
import { MAX_FILE_BYTES, readDocText } from '@/lib/laws/doc-io';

// 픽스처 = rhwp scaffold 로 만든 hwpx 와, 그것을 rhwp convert 로 바꾼 hwp (같은 문서)
const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/laws', name)));
const wasm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm'));

describe('hwp reading', () => {
  it('reads article text from a binary hwp', async () => {
    const t = await readHwpText(fx('sample-rules.hwp'), wasm);
    expect(t).toContain('제1조(목적) 이 규칙은 시험 회사 직원의 근로조건을 정한다.');
    expect(t).toContain('제3조(휴가) 연차유급휴가는 근로기준법에 따른다.');
    expect(t.split('\n')).toContain('1일 8시간');
  });
  it('yields the same article lines as the hwpx path', async () => {
    const articles = (s: string) => s.split('\n').filter((l) => /^제\d+조/.test(l));
    const hwp = await readHwpText(fx('sample-rules.hwp'), wasm);
    const hwpx = await readDocText(fx('sample-rules.hwpx'), 'hwpx');
    expect(articles(hwp)).toEqual(articles(hwpx));
    expect(articles(hwp)).toHaveLength(3);
  });
  it('rejects non-hwp and oversized input before loading the engine', async () => {
    await expect(readHwpText(fx('sample-rules.hwpx'), wasm)).rejects.toThrow('hwp) 파일 형식이 아닙니다');
    await expect(readHwpText(new Uint8Array(MAX_FILE_BYTES + 1), wasm)).rejects.toThrow('10MB');
  });
  it('turns a broken hwp into a readable error', async () => {
    const broken = fx('sample-rules.hwp').slice(0, 1024);
    await expect(readHwpText(broken, wasm)).rejects.toThrow('hwp 본문을 읽지 못했습니다');
  });
});
