// 덱 디자인 프리셋 조각 2-나 — 회의(pre·final)·TBM·교안 덱은 프리셋을 고르지 않으면 지금 출력 그대로.
// 슬라이드 XML 과 노트 XML(근거 anchor·확인 문제 답이 노트에 있다)을 이름순으로 이어 붙인 해시로 고정한다.
// 해시는 조각 2-나 착수 전 HEAD(88d321de)에서 뽑았다.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { makeMeetingPptx } from '../../src/lib/office/pptx/meeting';
import { makeTbmPptx } from '../../src/lib/office/pptx/tbm';
import { makeEducationPptx } from '../../src/lib/office/pptx/education';
import { education, educationBare, meetingFinal, meetingFinalEmpty, meetingPre, meetingPreEmpty, tbm } from './office-pptx-decks.fixture';

export async function deckHash(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(n)).sort();
  const h = createHash('sha256');
  for (const n of names) h.update(await zip.file(n)!.async('string'));
  return h.digest('hex');
}

type Make = (o: Record<string, unknown>) => Promise<{ ok: boolean; bytes?: Uint8Array; slides: { code: string }[]; errors?: string[] }>;
const CASES: Record<string, { make: Make; A4: string; wide: string; slides: string }> = {
  pre: {
    make: (o) => makeMeetingPptx(meetingPre(), { ...o, kind: 'pre' }),
    A4: '482be4a6368f5e19a7d50cc0fd7bf52650465227dabff7fc91a401879b9c53cb',
    wide: '98fbb3defb9ee0d5ea036e601519759835fbfe9634e35873814cc66d9a1a7369',
    slides: 'P1,P2,P3,P4,P4,P5,P5,P5,P6,P6,P7,P7,P8,P9,P10,P10',
  },
  preEmpty: {
    make: (o) => makeMeetingPptx(meetingPreEmpty(), { ...o, kind: 'pre' }),
    A4: 'e822b0d83a03183051f0b8fd674a5365600cff2007f2eacb139e14bd1851ba49',
    wide: '090e6c8f7c2d1680df6d8f7abe29b584eff553b6bf6c8ea324606cf91ddec5e8',
    slides: 'P1,P2,P3,P4,P5,P6,P7,P8,P9,P10',
  },
  final: {
    make: (o) => makeMeetingPptx(meetingFinal(), { ...o, kind: 'final' }),
    A4: '9c86ca8952afdeeccf7115d7cf219151d174efa988009a85d2aff4ba8507c37a',
    wide: 'a388219462440ab08306d039402431e5cfe0dee82a6f07d279b4566da3740602',
    slides: 'F1,F2,F3,F3,F4,F4,F5,F6,F7,F8,F8',
  },
  finalEmpty: {
    make: (o) => makeMeetingPptx(meetingFinalEmpty(), { ...o, kind: 'final' }),
    A4: 'ec26062267f685598fc0963707deea707bd3dee48ae7d782683033f903085381',
    wide: 'eb7eed1fb34bb3cb5fb0a64f0f095c17608b8ca5ea2cedf83648b0646e8cef7c',
    slides: 'F1,F2,F3,F4,F5,F7,F8',
  },
  tbm: {
    make: (o) => makeTbmPptx(tbm(), o),
    A4: '613fb9317ec5352c1adfe3e7b68b8f519e50eb1e1956ba6ae1c5fce87a963e48',
    wide: '5dd1a3a2b920016ca362df02a68004bf25845a36f98438ff791f23e611e385a0',
    slides: 'T1,T2',
  },
  education: {
    make: (o) => makeEducationPptx(education(), o),
    A4: '22223abb506f75315a660caa4212822b997eb78b804976d4eae0cc71b128459c',
    wide: 'cf6758a01ae5bab35a300e3dbe17d6a99b5fdc0ce28ef1d7ec38d504bed722d6',
    slides: 'E1,E2,E3,E4,E4,E5,E6',
  },
  educationBare: {
    make: (o) => makeEducationPptx(educationBare(), o),
    A4: '7a853beae52468b95e933a4ab98a6c078d34d8b918be2b5da5a11cb45ab4fcd9',
    wide: 'cd0c762d219d4ce4d40d9f890a510ad325436f58b85f4113e552e335b9c6c4a9',
    slides: 'E1,E2,E3,E5,E6',
  },
};

describe('프리셋 미지정 = 지금 출력 그대로(슬라이드 + 노트 XML 해시)', () => {
  for (const [k, c] of Object.entries(CASES)) {
    it(`${k} — A4·16:9·design: undefined`, async () => {
      const a = await c.make({});
      expect(a.ok, (a.errors ?? []).join()).toBe(true);
      expect(a.slides.map((s) => s.code).join(',')).toBe(c.slides);
      expect(await deckHash(a.bytes!)).toBe(c.A4);
      expect(await deckHash((await c.make({ design: undefined })).bytes!)).toBe(c.A4);
      expect(await deckHash((await c.make({ layout: '16:9' })).bytes!)).toBe(c.wide);
    });
  }
});
