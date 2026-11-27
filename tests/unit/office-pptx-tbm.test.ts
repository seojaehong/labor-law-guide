// TBM 카드 덱(전파 덱 1종) — 합성 스냅숏으로만 시험한다(실명·실주소 없음).
// 근거: 고시 제16조①3(매 작업일 공유) · 법 제36조④ 후단(중대재해 우려 요인 작업 전 주지).
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeTbmPptx, type TbmSnapshot } from '../../src/lib/office/pptx/tbm';
import { DEFAULT_LIMITS, OFFICE_OPS, makeTbmPptx as libTbm } from '@/lib/office';

function snapshot(): TbmSnapshot {
  return {
    site: '합성 사업장',
    workDate: '2026-12-02',
    basisDate: '2026-12-01',
    cycle: '2026년 2회차',
    tasks: [
      {
        id: 'T-1',
        process: '지게차 하역',
        place: '1동 하역장',
        hazards: [
          // 입력 순서와 고르는 순서가 다르다 — 허용 → 조건부 → 신규 → 허용 불가 순으로 넣는다
          { id: 'H-ok', situation: '허용 수준 위험', measures: ['대책 ok'], acceptability: 'acceptable' },
          { id: 'H-cond', situation: '조건부 위험', measures: ['대책 cond'], acceptability: 'conditional' },
          { id: 'H-new', situation: '새로 생긴 위험', measures: ['대책 new'], acceptability: 'acceptable', kind: 'new' },
          { id: 'H-bad', situation: '후진 중 보행자 접촉', cause: '후방 시야 가림', consequence: '부딪힘', measures: ['후방 경보기 작동 확인', '유도자 배치'], acceptability: 'unacceptable', anchors: ['A-1'] },
        ],
        questions: ['오늘 유도자는 어디에 서나요?'],
      },
      {
        id: 'T-2',
        process: '선반 정리',
        hazards: [
          { id: 'H-s1', situation: '사다리에서 떨어짐', measures: ['사다리 고정'], acceptability: 'conditional', seriousConcern: true },
        ],
      },
    ],
    anchors: [{ id: 'A-1', source: '합성 평가표', location: '시트1!B5' }],
  };
}

async function slideXml(bytes: Uint8Array, n: number) {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file(`ppt/slides/slide${n}.xml`)!.async('string');
}

describe('makeTbmPptx — 작업별 TBM 카드', () => {
  it('작업마다 한 장, 장 정보에 작업 id 와 근거를 싣는다', async () => {
    const r = await makeTbmPptx(snapshot());
    expect(r.ok).toBe(true);
    expect(r.slides.map((s) => s.code)).toEqual(['T1', 'T2']);
    expect(r.slides[0].taskId).toBe('T-1');
    expect(r.slides[0].anchors).toEqual(['A-1']);
  });

  it('3개 이내로 고른다 — 허용 불가 → 조건부 → 신규·변경 순, 남은 것은 omitted 로 돌려준다', async () => {
    const r = await makeTbmPptx(snapshot());
    expect(r.picks[0]).toEqual({ taskId: 'T-1', shown: ['H-bad', 'H-cond', 'H-new'], omitted: ['H-ok'] });
    const xml = await slideXml(r.bytes!, 1);
    expect(xml).toContain('후진 중 보행자 접촉');
    expect(xml).toContain('후방 경보기 작동 확인');
    expect(xml).not.toContain('허용 수준 위험');
    // 빠진 것이 있으면 카드에 「외 1건」을 적는다(조용히 버리지 않는다)
    expect(xml).toContain('외 1건');
  });

  it('같은 등급이면 중대재해 우려 표시가 앞선다', async () => {
    const s = snapshot();
    s.tasks[1].hazards.unshift({ id: 'H-s0', situation: '조건부 일반', measures: ['x'], acceptability: 'conditional' });
    const r = await makeTbmPptx(s);
    expect(r.picks[1].shown).toEqual(['H-s1', 'H-s0']);
  });

  it('maxHazards 로 장당 개수를 줄일 수 있고 1~3 밖이면 거절한다', async () => {
    const r = await makeTbmPptx(snapshot(), { maxHazards: 1 });
    expect(r.picks[0].shown).toEqual(['H-bad']);
    const bad = await makeTbmPptx(snapshot(), { maxHazards: 4 });
    expect(bad.ok).toBe(false);
  });

  it('확인 질문은 입력 원문만 싣고, 없으면 지어내지 않고 경고한다', async () => {
    const r = await makeTbmPptx(snapshot());
    expect(await slideXml(r.bytes!, 1)).toContain('오늘 유도자는 어디에 서나요?');
    expect(r.warnings.some((w) => w.includes('T-2') && w.includes('확인 질문'))).toBe(true);
  });

  it('서명란은 빈칸이고 이름 칸을 채우지 않는다', async () => {
    const r = await makeTbmPptx(snapshot(), { signatureRows: 5 });
    const xml = await slideXml(r.bytes!, 1);
    expect(xml).toContain('서명');
    expect(r.ok).toBe(true);
  });

  it('작업이 없거나 위험요인이 없는 작업은 errors 로 돌린다(던지지 않는다)', async () => {
    const empty = await makeTbmPptx({ ...snapshot(), tasks: [] });
    expect(empty.ok).toBe(false);
    const s = snapshot();
    s.tasks[1].hazards = [];
    const r = await makeTbmPptx(s);
    expect(r.ok).toBe(false);
    expect(r.errors!.join(' ')).toContain('T-2');
    const junk = await makeTbmPptx({ site: 1 } as never);
    expect(junk.ok).toBe(false);
  });

  it('anchors 에 없는 근거 id 는 경고한다', async () => {
    const s = snapshot();
    s.tasks[0].hazards[3].anchors = ['A-없음'];
    const r = await makeTbmPptx(s);
    expect(r.warnings.some((w) => w.includes('A-없음'))).toBe(true);
  });
});

describe('라이브러리 입구 pptx.tbm', () => {
  it('OFFICE_OPS 에 pptx.tbm 이 있고 결과 파일을 files[0] 으로 준다', async () => {
    expect(OFFICE_OPS).toContain('pptx.tbm');
    const r = await libTbm(snapshot(), { limits: DEFAULT_LIMITS });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta.op).toBe('pptx.tbm');
    expect(r.files![0].name).toBe('tbm.pptx');
    expect(r.data.picks[0].omitted).toEqual(['H-ok']);
  });

  it('입력이 틀리면 INVALID_ARGS', async () => {
    const r = await libTbm({ ...snapshot(), tasks: [] }, { limits: DEFAULT_LIMITS });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('INVALID_ARGS');
  });
});
