import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import { HwpEditDoc } from '@/lib/hwp/hwp-doc';
import { applyChanges, planChanges } from '@/lib/hwp/apply';
import { checkHeader } from '@/lib/md-hwpx/header-check';
import type { PeriodItem, StdRule } from '@/lib/laws/standard-check';
import type { Verdict } from '@/lib/laws/rules-check';

// S0b — 기존 hwpx 에 글자 한 곳만 바꿔 반영했을 때 header.xml 이 보존되는가(편집기술사양 S0b).
// 결과가 S11(사람이 손본 문서 글자 치환) 경로의 우선순위를 정한다.
// 실측 261119(applyChanges([]) 로 다시 쓰기): 합성 픽스처는 header 가 바이트까지 같지만, 실제 문서 4건은 모두 달라졌다.
//  - 한글로 저장한 재단 양식: 꼴만 바뀜(textDir="LTR" 삭제, typeInfo familyType·strikeout 추가) — 모양 값은 그대로
//  - 엔진 산출물: paraPr 의 hp:switch 안 heading(OUTLINE level 8·9) 3개와 borderFill diagonal(NONE) 2개가 빠짐
//  → 사람이 손본 문서는 rhwp 다시 쓰기 대신 section 글자만 바꾸는 S11 경로를 기본으로 한다. 여기서는 S0 불변식만 지킨다.
const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/laws', name)));
const wasm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm'));
const header = async (b: Uint8Array) => (await JSZip.loadAsync(b)).file('Contents/header.xml')!.async('string');

const rule: StdRule = {
  lawId: 'x', law: '시험법', article: '제1조', effective: '20260101', topic: '노동절 명칭', art93: '', required: true,
  keywords: [], ok: ['노동절'], stale: ['근로자의 날'], point: '', clause: '○. 노동절(5월 1일)', mst: null, everywhere: true,
};
const item: PeriodItem = {
  std: { id: 's-labor', no: '제1조', title: '휴일', chapter: null, kind: '필수', text: '', laws: [], keywords: [], status: 'checked' },
  user: [], events: [],
  verdicts: [{ rule, status: '미반영', where: null, stale: rule.stale, missing: [] } as Verdict],
  status: '고칠 것', proposal: rule.clause, proposalFrom: '매핑',
};

describe('S0b — 글자 치환 반영본의 header 보존', () => {
  it('낱말 한 곳 치환 뒤에도 header 불변식(S0)을 지킨다', async () => {
    const original = fx('table-rules.hwpx');
    const doc = await HwpEditDoc.open(original.slice(), wasm);
    const words = planChanges(doc.paragraphs(), [item]).changes.filter((c) => c.kind === 'word');
    doc.free();
    expect(words.length).toBeGreaterThan(0);
    const r = await applyChanges(original, [words[0]], 'hwpx', wasm);
    expect(checkHeader(await header(r.bytes))).toEqual([]);
  });
});
