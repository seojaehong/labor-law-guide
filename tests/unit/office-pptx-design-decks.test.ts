// 덱 디자인 프리셋 조각 2-나 — 회의(pre·final)·TBM·교안 덱에도 design 옵션.
// 프리셋을 고르면 전 장이 그 프리셋의 머리 모양·목록 부품으로, 글 언어 ko-KR, 판형 기본 16:9.
// 글은 원문 그대로(말줄임 없음) · 노트(근거 anchor·문제 답) 유지 · 결과 데이터(요약·고른 것·이월·변화)는 기본 출력과 같다.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeMeetingPptx } from '../../src/lib/office/pptx/meeting';
import { makeTbmPptx } from '../../src/lib/office/pptx/tbm';
import { makeEducationPptx } from '../../src/lib/office/pptx/education';
import { DESIGN_IDS, designsFor, type DesignId } from '../../src/lib/office/pptx/design';
import { education, educationBare, meetingFinal, meetingFinalEmpty, meetingPre, meetingPreEmpty, tbm } from './office-pptx-decks.fixture';

async function parts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const num = (n: string) => Number(n.match(/(\d+)\.xml$/)![1]);
  const pick = (re: RegExp) => Object.keys(zip.files).filter((n) => re.test(n)).sort((a, b) => num(a) - num(b));
  const slides = await Promise.all(pick(/^ppt\/slides\/slide\d+\.xml$/).map((n) => zip.file(n)!.async('string')));
  const notes = await Promise.all(pick(/^ppt\/notesSlides\/notesSlide\d+\.xml$/).map((n) => zip.file(n)!.async('string')));
  const pres = await zip.file('ppt/presentation.xml')!.async('string');
  return { slides, notes, pres };
}
const names = (xml: string) => [...xml.matchAll(/<p:cNvPr id="\d+" name="([^"]+)"/g)].map((m) => m[1]);
const texts = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('');

const HEAD: Record<DesignId, string | null> = { quiet: null, field: 'head:left-band', app: 'head:pill-meta', report: 'head:ribbon', story: 'head:capsule' };
const LIST: Record<DesignId, string> = { quiet: 'part:list-hairline', field: 'part:list-rowcard', app: 'part:list-chipcard', report: 'part:list-grid', story: 'part:list-storycard' };

type R = { ok: boolean; bytes?: Uint8Array; slides: { code: string }[]; warnings: string[]; errors?: string[] } & Record<string, unknown>;
interface DeckCase {
  make: (o: Record<string, unknown>) => Promise<R>;
  /** 프리셋 판 장 종류 순서(이어지는 같은 종류는 하나로) */
  codes: string;
  /** 원문 그대로 실려야 하는 글 */
  must: string[];
  /** 노트에 있어야 하는 글 */
  notes: string[];
  /** 기본 출력과 같아야 하는 결과 키 */
  same: string[];
}

const DECKS: Record<string, DeckCase> = {
  education: {
    make: (o) => makeEducationPptx(education(), o) as unknown as Promise<R>,
    codes: 'E1,E2,E3,E4,E5,E6',
    must: ['별표 5 제1호 다목', '지게차 부딪힘', '유도자 배치 / 후방 경보기', '합성 사례 본문 후진하던', '출처: 합성 출처', '지게차 후진 때 누가 유도하나요?', '허용 불가', '조건부', '많이 나온 재해 유형'],
    notes: ['답(입력 원문)', '유도자', '(답 미기재)'],
    same: ['summary', 'shown', 'omitted'],
  },
  educationBare: {
    make: (o) => makeEducationPptx(educationBare(), o) as unknown as Promise<R>,
    codes: 'E1,E2,E3,E5,E6',
    must: ['별표 5 제1호 가목', '1.', '교육 확인 서명부'],
    notes: [],
    same: ['summary', 'shown', 'omitted'],
  },
  tbm: {
    make: (o) => makeTbmPptx(tbm(), o) as unknown as Promise<R>,
    codes: 'T1,T2',
    must: ['지게차 하역', '1동 하역장', '후진 중 보행자 접촉', '후방 시야 가림 → 부딪힘', '후방 경보기 작동 확인  /  유도자 배치', '오늘 유도자는 어디에 서나요?', '경보기 소리를 들었나요?', '허용 불가', '중대재해 우려', '외 1건', '확인 서명'],
    notes: ['근거 anchor:', 'A-1 — 합성 평가표 시트1!B5', '근거 anchor: 없음'],
    same: ['picks'],
  },
  pre: {
    make: (o) => makeMeetingPptx(meetingPre(), { ...o, kind: 'pre' }) as unknown as Promise<R>,
    codes: 'P1,P2,P3,P4,P5,P6,P7,P8,P9,P10',
    must: ['회의 전 검토안', '전회 조치 이행 확인', '반장(역할)', '하역장 후진 접촉', '빈도×강도 3×3', '합성 위험요인 8', '조치 결과 1', '산업안전보건기준에 관한 규칙 제21조', '사진 없음', '야간 통로 어두움', '의견 9 통로 조명이 어둡다', '비교 안 함', 'N-01 을 이번 회차에 반영할지', '반영 / 보류', 'A-X-6', '초안'],
    notes: ['근거 anchor:', 'A-R-01 — 합성 평가표 시트1!B5'],
    same: ['changes'],
  },
  preEmpty: {
    make: (o) => makeMeetingPptx(meetingPreEmpty(), { ...o, kind: 'pre' }) as unknown as Promise<R>,
    codes: 'P1,P2,P3,P4,P5,P6,P7,P8,P9,P10',
    must: ['전회 항목 없음', '해당 항목 없음', '의견 없음', '근거 없음', '참석 예정자 미입력'],
    notes: ['근거 anchor: 없음'],
    same: ['changes'],
  },
  final: {
    make: (o) => makeMeetingPptx(meetingFinal(), { ...o, kind: 'final' }) as unknown as Promise<R>,
    codes: 'F1,F2,F3,F4,F5,F6,F7,F8',
    must: ['회의 후 확정본', '확정 v2', '근로자대표 참여: 예', '결정 9 반영', '대책 6 통로 조명 교체', '사다리 상단 고정 장치 설치·2인 1조 작업', '설비 교체 예정', '유도자 배치', 'N-01#2', 'A-13', 'template meeting-v0'],
    notes: ['근거 anchor:', 'A-2 — 합성 평가표 시트1!C4'],
    same: ['carryOver'],
  },
  finalEmpty: {
    make: (o) => makeMeetingPptx(meetingFinalEmpty(), { ...o, kind: 'final' }) as unknown as Promise<R>,
    codes: 'F1,F2,F3,F4,F5,F7,F8',
    must: ['확정 결정 없음', '조치 계획 없음', '보류 항목 없음', '이월 항목 없음', '근로자대표 참여: 아니오'],
    notes: [],
    same: ['carryOver'],
  },
};

describe('회의·TBM·교안 덱 — design 프리셋', () => {
  for (const [deck, c] of Object.entries(DECKS)) {
    for (const id of DESIGN_IDS) {
      it(`${deck} · ${id}`, async () => {
        const r = await c.make({ design: id });
        expect(r.ok, (r.errors ?? []).join()).toBe(true);
        // 장 종류·순서는 기본 출력과 같다(목록이 길면 같은 종류가 여러 장으로 이어진다)
        const kinds = (l: { code: string }[]) => l.map((x) => x.code).filter((x, i, a) => x !== a[i - 1]).join(',');
        expect(kinds(r.slides)).toBe(c.codes);
        const p = await parts(r.bytes!);
        expect(p.pres, '판형 16:9').toMatch(/<p:sldSz cx="12192000" cy="6858000"/);
        const all = p.slides.map(texts).join('\n');
        for (const m of c.must) expect(all, `${deck}·${id} 원문 「${m}」`).toContain(m);
        expect(all).not.toMatch(/…|\.\.\./);
        const notes = p.notes.map(texts).join('\n');
        for (const m of c.notes) expect(notes, `${deck}·${id} 노트 「${m}」`).toContain(m);
        // 머리 모양 — 전 장
        if (HEAD[id]) p.slides.forEach((x, i) => expect(names(x), `${deck}·${id} ${i + 1}장 머리`).toContain(HEAD[id]));
        p.slides.forEach((x, i) => expect(names(x), `${deck}·${id} ${i + 1}장 바닥줄`).toContain('foot:left'));
        // 목록 부품 — 프리셋 고유 이름이 어느 장엔가 있고, 다른 프리셋 목록 부품은 없다
        const nm = p.slides.flatMap(names);
        expect(nm.some((n) => n === LIST[id] || n.startsWith(`part:empty-`) || n.startsWith('part:sign-')), `${deck}·${id} 목록 부품`).toBe(true);
        for (const o of DESIGN_IDS.filter((x) => x !== id)) expect(nm, `${deck}·${id} 에 ${o} 부품`).not.toContain(LIST[o]);
        // 글 언어 ko-KR — 글 조각마다
        for (const x of p.slides) for (const m of x.matchAll(/<a:rPr([^>]*)>/g)) expect(m[1], `${deck}·${id} lang`).toContain('lang="ko-KR"');
        // 회의 덱 먹색 테마 값이 프리셋 판에 남지 않는다
        for (const col of ['B7791F', '1F3A5F', 'A6C4EE']) expect(p.slides.join(''), `${deck}·${id} 먹색 ${col}`).not.toContain(col);
        // 결과 데이터는 기본 출력과 같다
        const base = await c.make({});
        for (const k of c.same) expect(r[k], `${deck}·${id} ${k}`).toEqual(base[k]);
      });
    }
  }

  it('없는 프리셋 이름은 오류(기본값으로 바꿔 만들지 않음)', async () => {
    for (const c of [DECKS.education, DECKS.tbm, DECKS.pre, DECKS.final]) {
      const r = await c.make({ design: 'neon' });
      expect(r.ok).toBe(false);
      expect((r.errors ?? []).join(' ')).toContain('design');
    }
  });

  it('프리셋 + 판형 A4 를 주면 A4 가로', async () => {
    for (const c of [DECKS.education, DECKS.tbm, DECKS.pre, DECKS.final]) {
      const r = await c.make({ design: 'report', layout: 'A4' });
      expect(r.ok).toBe(true);
      expect((await parts(r.bytes!)).pres).toMatch(/<p:sldSz cx="10689336" cy="7562088"/);
    }
  });

  it('긴 글 — 말줄임 없이 원문 전부, 장을 나누거나 칸을 늘린다', async () => {
    for (const id of DESIGN_IDS) {
      for (const [make, word] of [
        [() => makeEducationPptx(education(true), { design: id }), '낱말24'],
        [() => makeTbmPptx(tbm(true), { design: id }), '낱말20'],
        [() => makeMeetingPptx(meetingPre(true), { kind: 'pre', design: id }), '낱말24'],
        [() => makeMeetingPptx(meetingFinal(true), { kind: 'final', design: id }), '낱말24'],
      ] as const) {
        const r = (await make()) as unknown as R;
        expect(r.ok, `${id} ${(r.errors ?? []).join()}`).toBe(true);
        const all = (await parts(r.bytes!)).slides.map(texts).join('\n');
        expect(all).toContain(word);
        expect(all).not.toMatch(/…|\.\.\./);
      }
    }
  });
});

describe('designsFor — 덱 종류를 받는다', () => {
  it('기존 호출(스냅숏만 · 스냅숏+ids)은 그대로 전파 덱 기준', () => {
    const s = meetingFinal();
    expect(designsFor(s).map((x) => x.id)).toEqual([...DESIGN_IDS]);
    expect(designsFor(s, ['app', 'quiet']).map((x) => x.id)).toEqual(['app', 'quiet']);
    expect(designsFor(s, 'broadcast')).toEqual(designsFor(s));
  });

  it('덱 종류별 — 5종 결과, 담을 수 없으면 이유', () => {
    for (const [kind, snap] of [['meeting-pre', meetingPre()], ['meeting-final', meetingFinal()], ['tbm', tbm()], ['education', education()]] as const) {
      const r = designsFor(snap as never, kind);
      expect(r.map((x) => x.id), kind).toEqual([...DESIGN_IDS]);
      for (const x of r) expect(typeof x.reason).toBe('string');
    }
    // TBM 작업 이름이 아주 길면 제목이 한 줄에 들지 않는다는 이유
    const t = tbm();
    t.tasks[0].process = '아주 긴 작업 이름 '.repeat(12);
    const r = designsFor(t, 'tbm');
    for (const x of r) {
      expect(x.ok).toBe(false);
      expect(x.reason).toContain('제목');
    }
    // 교안 요약 수가 칸에 들지 않으면(허용 불가 123456789건) 이유
    const e = education();
    e.hazards = Array.from({ length: 3 }, (_, i) => ({ id: `H-${i}`, situation: 's', measures: [], acceptability: 'unacceptable' as const }));
    expect(designsFor(e, 'education').every((x) => x.ok)).toBe(true);
  });
});

describe('designsFor 덱 종류 — 공개 이름 · 없는 종류는 오류', () => {
  it('라이브러리 입구에서 DESIGN_DECK_KINDS · DesignDeckKind 로 이름이 겹치지 않게 내보낸다', async () => {
    const lib = await import('@/lib/office');
    expect([...lib.DESIGN_DECK_KINDS]).toEqual(['broadcast', 'meeting-pre', 'meeting-final', 'tbm', 'education']);
    // 테마 DECK_KINDS(proposal·report …)는 그대로
    expect(lib.DECK_KINDS).not.toContain('meeting-pre');
    const k: import('@/lib/office').DesignDeckKind = 'tbm';
    expect(lib.designsFor(tbm(), k).length).toBe(DESIGN_IDS.length);
  });
  it('없는 덱 종류(테마 종류·오타·프리셋 이름)는 조용히 ok 를 내지 않고 오류', () => {
    for (const bad of ['report', 'meeting', 'quiet']) expect(() => designsFor(meetingPre(), bad as never), bad).toThrow(/덱 종류/);
  });
});
