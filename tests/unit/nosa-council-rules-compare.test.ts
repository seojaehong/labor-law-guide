import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {
  compareCouncilRules, comparisonFormDoc, comparisonMarkdown, comparisonSheet, DEL_MARK, markChanges, NEW_MARK,
} from '@/lib/nosa-council/rules-compare';
import { UL_CLOSE, UL_OPEN, unmarkUnderline } from '@/lib/laws/underline';
import { compareDocx } from '@/lib/laws/doc-io';
import { formHwpx } from '@/lib/work-rules-report/render';
import { registerNosaRecords } from '../../tools/k-labor/groups/nosa-records.mjs';

// 가린 견본 규정(가상 사업장) + 테스트 안에서 고친 개정안만 쓴다
const SAMPLE = fs.readFileSync('tests/fixtures/nosa-council/rules-sample-2021.txt', 'utf8');
const AMENDED = SAMPLE.replace('증진함으로서', '증진함으로써')
  .replace('방해해서는 안된다.', '방해해서는 안 된다.')
  .replace(' 16. 기타 노사협조에 관한 사항', ' 16. 직장 내 성희롱 예방에 관한 사항\n\n 17. 그 밖의 노사협조에 관한 사항')
  .replace(/제15조\(회의의 공개\)[\s\S]*?아니할 수 있다\.\s*\n/, '')
  .replace('[위원 등 명부]', ' 부 칙(2026. 12. 1.)\n\n 이 규정은 2026년 12월 1일부터 시행한다.\n\n[위원 등 명부]');
const vis = (s: string) => s.split(UL_OPEN).join('[').split(UL_CLOSE).join(']');

describe('협의회규정 신·구조문대비표 대조', () => {
  const r = compareCouncilRules(SAMPLE, AMENDED);
  const row = (where: string) => r.rows.find((x) => x.where === where)!;

  it('같은 글이면 줄이 없다', () => {
    expect(compareCouncilRules(SAMPLE, SAMPLE).rows).toEqual([]);
  });

  it('바뀐 조만 순서대로 — 개정·삭제·신설', () => {
    expect(r.rows.map((x) => `${x.where}:${x.kind}`)).toEqual(['제1조:개정', '제4조:개정', '제15조:삭제', '제18조:개정', '부칙:신설']);
    expect(r.parsed.current).toMatchObject({ articles: 29, addenda: 1 });
    expect(r.parsed.amended).toMatchObject({ articles: 28, addenda: 2 });
    expect(r.workplaceName).toBe('가나상사(주)');
  });

  it('바뀐 어절에 양쪽 밑줄, 줄 끝 마침표는 빼고', () => {
    expect(vis(row('제1조').old)).toContain('[증진함으로서]');
    expect(vis(row('제1조').neu)).toContain('[증진함으로써]');
    expect(vis(row('제4조').old)).toContain('[안된다].');
    expect(vis(row('제4조').neu)).toContain('[안 된다].');
  });

  it('안 바뀐 항·호는 (생략)/(현행과 같음)', () => {
    expect(row('제4조').old).toMatch(/② \(생략\)$/);
    expect(row('제4조').neu).toMatch(/② \(현행과 같음\)$/);
    expect(row('제18조').old).toContain('1.~15. (생략)');
    expect(row('제18조').neu).toContain('1.~15. (현행과 같음)');
  });

  it('번호가 밀린 호는 내용으로 짝짓는다 — 옛 16호 ↔ 새 17호, 새 16호는 신설', () => {
    const o = vis(row('제18조').old).split('\n');
    const n = vis(row('제18조').neu).split('\n');
    const k = n.findIndex((l) => l.includes('성희롱'));
    expect(o[k]).toBe(NEW_MARK);
    expect(n[k]).toBe('[16. 직장 내 성희롱 예방에 관한 사항]');
    expect(o[k + 1]).toBe('[16. 기타 노사협조에] 관한 사항');
    expect(n[k + 1]).toBe('[17. 그 밖의 노사협조에] 관한 사항');
  });

  it('삭제한 조·신설한 부칙', () => {
    expect(row('제15조').neu).toBe(DEL_MARK);
    expect(unmarkUnderline(row('제15조').old)).toMatch(/^제15조\(회의의 공개\)/);
    expect(row('부칙').old).toBe(NEW_MARK);
    expect(unmarkUnderline(row('부칙').neu)).toContain('2026년 12월 1일부터 시행한다');
  });

  it('markChanges — 띄어쓰기만 바뀌면 붙은 어절에 긋는다', () => {
    const [a, b] = markChanges('출석 위원 3분의 2이상의 찬성', '출석위원 3분의 2 이상의 찬성');
    expect(vis(a)).toBe('[출석 위원] 3분의 [2이상의] 찬성');
    expect(vis(b)).toBe('[출석위원] 3분의 [2 이상의] 찬성');
  });

  it('마크다운 — <u> 밑줄, <신 설>·<삭 제> 는 글자 그대로', () => {
    const md = comparisonMarkdown(r.rows, { workplaceName: r.workplaceName, amendDate: '2026. 12. 1.' });
    expect(md).toContain('# 가나상사(주) 노사협의회규정 신·구조문대비표');
    expect(md).toContain('| 현 행 | 개 정 안 |');
    expect(md).toContain('<u>증진함으로써</u>');
    expect(md).toContain('| <삭 제> |');
    expect(md).not.toMatch(/[—]/);
  });

  it('docx·hwpx 에 밑줄이 실린다(hwpx 가로)', async () => {
    const meta = { workplaceName: r.workplaceName };
    const docx = await JSZip.loadAsync(await (await compareDocx({ ...comparisonSheet(r.rows, meta), widths: [7519, 7519], labelColumn: false })).arrayBuffer());
    const doc = await docx.file('word/document.xml')!.async('string');
    expect(doc).toContain('<w:u w:val="single"/>');
    expect(doc).toContain('&lt;삭 제&gt;');
    expect(doc).not.toMatch(/[]/);
    const hwpx = await JSZip.loadAsync(await formHwpx([comparisonFormDoc(r.rows, meta)], { landscape: true }));
    const sec = await hwpx.file('Contents/section0.xml')!.async('string');
    const head = await hwpx.file('Contents/header.xml')!.async('string');
    expect(sec).toContain('landscape="NARROWLY"');
    expect(sec).toMatch(/charPrIDRef="1[78]"/);
    expect(sec).not.toMatch(/[]/);
    expect(head).toContain('<hh:underline type="BOTTOM"');
  });
});

describe('make_council_rules_comparison 도구', () => {
  type Reg = { name: string; handler: (a: object) => Promise<{ content: { text: string }[] }> };
  const tools: Reg[] = [];
  registerNosaRecords({ registerTool: (name: string, _c: unknown, handler: Reg['handler']) => tools.push({ name, handler }) });
  const t = tools.find((x) => x.name === 'make_council_rules_comparison')!;
  const call = async (a: object) => JSON.parse((await t.handler(a)).content[0].text);

  it('파일을 쓰고 다시 부르면 덮어쓰지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosa-compare-'));
    try {
      const cur = path.join(dir, 'cur.txt');
      fs.writeFileSync(cur, SAMPLE);
      const a = { currentFile: cur, amendedText: AMENDED, amendDate: '2026. 12. 1.', outDir: path.join(dir, 'out'), formats: ['docx', 'hwpx', 'xlsx'] };
      const out = await call(a);
      expect(out.ok).toBe(true);
      expect(out.rows).toBe(5);
      expect(out.kinds).toEqual({ 개정: 3, 신설: 1, 삭제: 1 });
      expect(out.files.map((f: { format: string }) => f.format)).toEqual(['docx', 'hwpx', 'xlsx']);
      for (const f of out.files) expect(fs.statSync(f.path).size).toBeGreaterThan(1000);
      expect(out.submission).toContain('신·구조문대비표');
      expect(out.markdown).toContain('<u>');
      const again = await call(a);
      expect(again.ok).toBe(false);
      expect(again.exists).toHaveLength(3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('주민등록번호 모양·글과 파일을 함께 주면 멈춘다', async () => {
    expect((await call({ currentText: `${SAMPLE}\n900101-1234568`, amendedText: AMENDED, outDir: os.tmpdir() })).ok).toBe(false);
    expect((await call({ currentText: SAMPLE, currentFile: 'x.txt', amendedText: AMENDED, outDir: os.tmpdir() })).error).toContain('하나만');
  });

  it('같은 글이면 파일을 만들지 않는다', async () => {
    const out = await call({ currentText: SAMPLE, amendedText: SAMPLE, outDir: path.join(os.tmpdir(), 'nosa-compare-none') });
    expect(out).toMatchObject({ ok: true, rows: 0, files: [] });
    expect(fs.existsSync(path.join(os.tmpdir(), 'nosa-compare-none'))).toBe(false);
  });

  it('ruleName 을 주면 제목이 그 규정 이름이 되고, 협의회 제출 안내는 싣지 않는다', async () => {
    const out = await call({ currentText: GEN_OLD, amendedText: GEN_NEW, ruleName: '인사규정', workplaceName: '가상상회', outDir: path.join(os.tmpdir(), `nosa-compare-rn-${Date.now()}`), formats: ['docx'] });
    expect(out.ok).toBe(true);
    expect(out.markdown.split('\n')[0]).toBe('# 가상상회 인사규정 신·구조문대비표');
    expect(out.submission).toBeUndefined();
    fs.rmSync(path.dirname(out.files[0].path), { recursive: true, force: true });
  });
});

// 협의회규정 밖의 사내 규정(인사·취업 규정)을 고칠 때 — 가상 문안
const GEN_OLD = [
  '제1조(목적) 이 규정은 직원 인사에 관한 사항을 정한다.',
  '제2조(대기기간 및 사후처리) ① 대기기간은 2개월로 하며 기간 안에 보직을 받지 못하면 자동으로 해고된다.',
  '② 대기발령을 받으면 해고 예고를 한 것으로 본다.',
  '제3조(정직) ① 정직자는 신분을 보유하나 직무에 종사하지 못한다.',
  '② 무기한 정직은 6개월 안에 복직 명령이 없으면 면직한다.',
  '③ 정직 기간에는 급여의 절반을 지급한다.',
  '제4조(감경)',
  '    제3조(정직)에 의하여 징계를 정할 때 공적이 있으면 감경할 수 있다.',
  '제5조(보칙) 그 밖의 사항은 대표이사가 따로 정한다.',
].join('\n');
const GEN_NEW = GEN_OLD
  .replace(/제2조\(대기기간 및 사후처리\)[\s\S]*?본다\./, '제2조(대기 기간과 사후 처리) ① 회사는 대기 기간이 끝나기 전에 재보직 여부를 인사위원회 심의로 결정한다.\n② 심의 결과 해고하는 경우에는 사유와 시기를 서면으로 알린다.')
  .replace(/제3조\(정직\)[\s\S]*?지급한다\./, '제3조(정직) ① 정직 기간은 1개월 이상 3개월 이하로 한다.\n② 정직 중인 직원은 신분은 유지하되 직무에 종사하지 못한다.\n③ 정직 기간이 끝나면 복직한다.');

describe('사내 규정 대비표 — 조 짝짓기', () => {
  const r = compareCouncilRules(GEN_OLD, GEN_NEW);
  const row = (where: string) => r.rows.find((x) => x.where === where);

  it('줄 처음의 「제N조(…)에 의하여」 인용은 조 머리가 아니다', () => {
    expect(r.parsed.current.articles).toBe(5);
    const cited = compareCouncilRules(GEN_OLD, GEN_OLD.replace('에 의하여 징계를', '에 따라 징계를'));
    expect(cited.rows.map((x) => `${x.where}:${x.kind}`)).toEqual(['제4조:개정']);
  });

  it('같은 번호에 제목이 조금 바뀐 조는 삭제+신설로 가르지 않고 개정 한 줄', () => {
    expect(r.rows.filter((x) => x.where === '제2조').map((x) => x.kind)).toEqual(['개정']);
  });

  it('조를 끼워 넣어 번호가 밀린 조는 번호가 아니라 내용으로 짝짓는다', () => {
    const ins = GEN_OLD.replace('제5조(보칙)', '제5조(교육) 회사는 연 1회 직무 교육을 한다.\n제6조(보칙)');
    const x = compareCouncilRules(GEN_OLD, ins);
    expect(x.rows.find((y) => y.where === '제5조')?.kind).toBe('신설');
    expect(unmarkUnderline(x.rows.find((y) => y.where === '제6조')!.old)).toContain('제5조(보칙)');
  });

  it('항을 모두 새로 쓴 조는 항마다 <삭 제>·<신 설>을 섞지 않고 조 통째로 대비한다', () => {
    const s = row('제2조')!;
    expect(s.old).not.toContain(NEW_MARK);
    expect(s.neu).not.toContain(DEL_MARK);
    expect(unmarkUnderline(s.old)).toContain('자동으로 해고된다');
    expect(unmarkUnderline(s.neu)).toContain('서면으로 알린다');
  });

  it('항 일부만 신설·삭제된 조도 <삭 제>·<신 설>이 조 머리에 붙지 않는다(조 전체 삭제로 읽힘)', () => {
    const s = row('제3조')!;
    expect(s.kind).toBe('개정');
    for (const cell of [s.old, s.neu]) {
      const first = unmarkUnderline(cell.split('\n')[0]);
      expect(first).not.toContain(DEL_MARK);
      expect(first).not.toContain(NEW_MARK);
    }
    expect(unmarkUnderline(s.old)).toContain('급여의 절반');
    expect(unmarkUnderline(s.neu)).toContain('1개월 이상 3개월 이하');
  });

  // 3각 검수(261126) 반례 — 가상 문안
  const kinds = (o: string, n: string) => compareCouncilRules(o, n).rows.map((x) => `${x.where}:${x.kind}`);

  it('비슷한 제목의 조를 앞에 끼워 넣어도 옛 조는 번호만 밀린 조와 짝짓는다', () => {
    const o = '제4조(목적) 인사를 정한다.\n제5조(채용절차) 인사팀은 지원자의 서류를 심사한다.';
    const n = '제4조(목적) 인사를 정한다.\n제5조(채용절차의 예외) 임원은 공개모집을 생략할 수 있다.\n제6조(채용절차) 인사팀은 지원자의 서류를 심사한다.';
    expect(kinds(o, n)).toEqual(['제5조:신설', '제6조:개정']);
  });

  it('가운뎃점·띄어쓰기만 다른 제목은 같은 조다', () => {
    expect(kinds('제7조(상벌) ① 직원의 공적을 인사기록부에 올린다.', '제7조(상·벌) ① 위원회는 포상 및 징계 기준을 별표로 정한다.')).toEqual(['제7조:개정']);
  });

  it('첫 항을 신설하면 머리를 양쪽 다 떼어 <신 설> 맞은편에 새 항이 온다', () => {
    const o = '제1조(신청) ① 휴가 기간을 미리 신청한다.\n② 부서장이 확인한다.';
    const n = '제1조(신청) ① 주말 당직자를 선발한다.\n② 휴가 기간을 미리 신청한다.\n③ 부서장이 확인한다.';
    const s = compareCouncilRules(o, n).rows[0];
    const O = s.old.split('\n').map(unmarkUnderline), N = s.neu.split('\n').map(unmarkUnderline);
    expect(O.length).toBe(N.length);
    const k = O.indexOf(NEW_MARK);
    expect(N[k]).toContain('주말 당직자');
  });

  it('현행 항은 그대로 두고 항만 덧붙이면 조 통째가 아니라 <신 설>로', () => {
    const s = compareCouncilRules('제2조(교육) ① 직원은 교육을 받는다.', '제2조(교육) ① 직원은 교육을 받는다.\n② 강사는 외부에서 초빙한다.\n③ 출석부를 보관한다.').rows[0];
    expect(s.old.split('\n').filter((l) => l === NEW_MARK)).toHaveLength(2);
    expect(s.old).not.toContain(UL_OPEN + '제2조');
  });

  it('표지의 줄 처음 인용문이 바뀌어도 표지 개정으로 잡는다', () => {
    const o = '회칙 작성 안내\n제9조(위임)에 따라 작성한 규정입니다.\n제1조(목적) 고충 처리에 관한 사항을 정한다.';
    expect(kinds(o, o.replace('작성한 규정', '다시 작성한 규정'))).toEqual(['표지:개정']);
  });

  it('제목 안에 다른 조 인용이 든 머리, 괄호 뒤 띄어 쓴 인용 둘 다 바르게 읽는다', () => {
    const nested = '제2조(선거구) 사업장별로 선거구를 둔다.\n제3조(제2조(선거구)에 따른 근로자위원 선출) 근로자위원은 투표로 선출한다.';
    expect(compareCouncilRules(nested, nested).parsed.current.articles).toBe(2);
    const spaced = '제1조(위임) 임기는 따로 정한다.\n제2조(선거) 아래와 같이 선거한다.\n제1조(위임) 에 의하여 위원은 투표로 선출한다.';
    expect(compareCouncilRules(spaced, spaced).parsed.current.articles).toBe(2);
  });

  it('조를 지워 번호를 당기면 지운 조만 삭제, 나머지는 내용으로 짝짓는다', () => {
    const why = '직원이 업무 외 질병이나 부상으로 3개월 넘게 요양이 필요하거나 병역 의무를 이행하게 된 때에는 신청을 받아 휴직을 명할 수 있다.';
    const len = '휴직 기간은 질병 휴직은 1년, 병역 휴직은 복무 기간으로 하며 부득이한 경우 인사위원회 심의로 한 번 연장할 수 있다.';
    const eff = '휴직 중인 직원은 신분은 보유하나 직무에 종사하지 못하며 휴직 기간이 끝나면 30일 안에 복직을 신청하여야 한다.';
    const o = `제2조(휴직의 사유) ${why}\n제3조(휴직의 기간) ${len}\n제4조(휴직의 효력) ${eff}`;
    const n = `제2조(휴직의 기간) ${len}\n제3조(휴직의 효력) ${eff}`;
    expect(kinds(o, n)).toEqual(['제2조:삭제', '제2조:개정', '제3조:개정']);
  });

  it('견본 규정에서 조 하나를 지우고 뒤 번호를 당기면 그 조만 삭제', () => {
    const cut = SAMPLE.replace(/제9조\([^)]*\)[\s\S]*?(?=\n\s*제10조)/, '').replace(/^(\s*)제(\d+)조/gm, (m, sp, n) => (Number(n) > 9 ? `${sp}제${Number(n) - 1}조` : m));
    expect(compareCouncilRules(SAMPLE, cut).rows.filter((x) => x.kind !== '개정').map((x) => `${x.where}:${x.kind}`)).toEqual(['제9조:삭제']);
  });

  it('닮은 제목의 조 사이에 새 조를 끼워 넣어도 뒤 조는 번호만 밀린 개정', () => {
    const kind = '징계는 견책, 감봉, 정직, 해고의 네 가지로 하고 그 수위는 비위의 정도와 고의 여부를 따져 정한다.';
    const proc = '징계 대상자에게는 회의 7일 전까지 출석을 통지하고 서면이나 구두로 소명할 기회를 준다.';
    const misc = '이 규정에 없는 사항은 근로기준법과 관계 법령을 따른다.';
    const o = `제2조(징계의 종류) ${kind}\n제3조(징계의 절차) ${proc}\n제4조(보칙) ${misc}`;
    const n = `제2조(포상) 회사는 업무 성과가 뛰어난 직원을 연말에 표창하고 부상을 줄 수 있다.\n제3조(징계의 종류) ${kind}\n제4조(징계의 절차) ${proc}\n제5조(보칙) ${misc}`;
    expect(kinds(o, n).filter((x) => !x.endsWith(':개정'))).toEqual(['제2조:신설']);
  });

  it('안 바뀐 항이 있으면 조 통째로 바꾸지 않는다(안 바뀐 항에 밑줄 금지)', () => {
    const s = compareCouncilRules('제5조(보칙) ① 그 밖의 사항은 따로 정한다.\n② 서식은 별지로 둔다.\n③ 세칙은 공고한다.', '제5조(보칙) ① 그 밖의 사항은 따로 정한다.\n② 회사는 매년 교육 계획을 세운다.\n③ 교육 결과는 3년간 보관한다.').rows[0];
    expect(s.old).toContain('(생략)');
  });

  it('부칙 첫 줄의 인용 문장만 고쳐도 바뀐 글이 보인다', () => {
    const o = '제1조(목적) 인사를 정한다.\n 부 칙\n제3조(정직)에 따라 진행 중인 절차는 종전 규정에 따른다.';
    const r = compareCouncilRules(o, o.replace('종전 규정', '이 규정'));
    expect(r.rows).toHaveLength(1);
    expect(unmarkUnderline(r.rows[0].neu)).toContain('이 규정에 따른다');
  });

  it('짧은 제목이 넓어진 조(휴가 → 휴가 및 휴직)는 같은 조', () => {
    expect(kinds('제8조(휴가) ① 연차휴가는 법에 따른다.', '제8조(휴가 및 휴직) ① 휴직 사유와 기간은 인사위원회가 정한다.')).toEqual(['제8조:개정']);
  });

  it('ruleName 의 줄바꿈·「신·구조문대비표」 중복을 정리한다', () => {
    expect(comparisonMarkdown([], { ruleName: '인사\n규정' }).split('\n')[0]).toBe('# 인사 규정 신·구조문대비표');
    expect(comparisonMarkdown([], { ruleName: '취업규칙 신·구조문대비표' }).split('\n')[0]).toBe('# 취업규칙 신·구조문대비표');
  });

  it('항 일부만 지우면 남은 항은 (생략), 지운 항은 <삭 제>', () => {
    const s = compareCouncilRules('제5조(보칙) ① 그 밖의 사항은 따로 정한다.\n② 서식은 별지로 둔다.\n③ 세칙은 공고한다.', '제5조(보칙) ① 그 밖의 사항은 따로 정한다.').rows[0];
    expect(s.neu.split('\n').filter((l) => l === DEL_MARK)).toHaveLength(2);
    expect(s.old).toContain('(생략)');
  });

  it('여러 모양의 줄 처음 인용을 조 머리로 읽지 않고, 앞 줄과 띄어 잇는다', () => {
    for (const ref of ['제3조(정직)제2항에 따른', '제3조(정직)에 의해', '제3조(정직)에 의거하여', '제3조(정직)에도 불구하고', '제3조(정직) 및 제4조(감경)에 따라', '제3조(정직)를 준용하여', '제3조(정직)에 해당하여', '제3조(정직)에 준하여', '제3조(정직)에서 규정한', '제3조(정직)를 위반하여', '제3조(정직)부터 제4조(감경)까지의']) {
      const t = `제3조(정직) 정직은 3개월 이하로 한다.\n제4조(감경) 공적이 있는 직원이\n${ref} 징계를 감경할 수 있다.`;
      const r = compareCouncilRules(t, t.replace('감경할', '줄일'));
      expect(r.parsed.current.articles, ref).toBe(2);
      expect(unmarkUnderline(r.rows[0].old), ref).toContain(`직원이 ${ref.slice(0, 3)}`);
    }
  });
});

describe('make_council_rules_comparison 도구 — 협의회 제출 안내', () => {
  type Reg = { name: string; handler: (a: object) => Promise<{ content: { text: string }[] }> };
  const tools: Reg[] = [];
  registerNosaRecords({ registerTool: (name: string, _c: unknown, handler: Reg['handler']) => tools.push({ name, handler }) });
  const call = async (a: object) => JSON.parse((await tools.find((x) => x.name === 'make_council_rules_comparison')!.handler(a)).content[0].text);
  it('이름에 「협의회」만 있으면 싣지 않고, 본문이 노사협의회규정이면 싣는다', async () => {
    const safety = '제1조(목적) 안전보건 협의에 관한 사항을 정한다.';
    expect((await call({ currentText: safety, amendedText: safety, ruleName: '산업안전보건협의회 운영규정', outDir: os.tmpdir() })).submission).toBeUndefined();
    const council = '제1조(목적) 이 규정은 노사협의회의 설치 및 운영에 관한 사항을 정한다.';
    expect((await call({ currentText: council, amendedText: council, ruleName: '한마음 운영규정', outDir: os.tmpdir() })).submission).toBeTruthy();
    expect((await call({ currentText: safety, amendedText: safety, ruleName: '노 사 협 의 회 규 정', outDir: os.tmpdir() })).submission).toBeTruthy();
    const hr = '제1조(목적) 인사에 관한 사항을 정한다. 노사협의회 협의를 거쳐 고친다.';
    expect((await call({ currentText: hr, amendedText: hr, ruleName: '인사규정', outDir: os.tmpdir() })).submission).toBeUndefined();
  });
});
