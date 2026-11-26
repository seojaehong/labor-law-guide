// 조각 5b(설계 v2.1 §2-5b) — 닫힌 밀기. 허용 목록 안에서만 at 아래를 n 행 내린다. 합성 반례만.
import { describe, it, expect } from 'vitest';
import { fillXlsxTemplate } from '@/lib/office/xlsx/fill';
import { R, SHEET, WB, type Opts, book, empty, footer, zip, unzip, rowsOf, S09, DRAW, sp, two, one, drawingXml, withDrawing } from './fixtures/xlsx-push';

describe('닫힌 밀기(§2-5b) — 바닥글이 있는 서식(S09 모양)', () => {
  it('at 아래 행·칸·병합·링크·쪽 나눔·선택·dimension·인쇄영역을 n 행 내리고 새 행에 자료를 쓴다', async () => {
    const r = await fillXlsxTemplate(await zip(S09()), { rows: rowsOf(5) });
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.preserved!.insertedRows).toMatchObject({ count: 2, at: 5, same: true });
    const a = await unzip(r.bytes!);
    const s = a.get(SHEET)!;
    expect(s).toMatch(/<row r="7"><c r="A7" t="inlineStr"><is><t>작성자 서명<\/t>/);
    expect(s).toMatch(/<c r="A8" t="inlineStr"><is><t>확인자<\/t>/);
    expect(s).toContain('<mergeCell ref="A7:D7"/>');
    expect(s).toContain('<mergeCell ref="C2:D2"/>');
    expect(s).toContain(`<hyperlink ref="A8" location="'평가표'!A8"`);
    expect(s).toContain('<brk id="7"');
    expect(s).toContain('<selection activeCell="A8" sqref="A8"/>');
    expect(s).toContain('<dimension ref="A1:D8"/>');
    expect(s).toContain('합성 위험 5');
    expect(a.get(WB)).toContain("'평가표'!$A$1:$D$8");
    expect(r.issues.map((i) => i.code)).toContain('ROWS_PUSHED');
    expect(r.preserved!.allSame).toBe(true);
  });

  it('바닥글이 자료 행과 서식이 같아도, 묶인 열이 병합에 덮인 행은 빈 자리로 세지 않는다(실서식 S09 20행)', async () => {
    // 5행 = 자료 행과 같은 서식이지만 A5:D5 병합(값은 A5) — B5 는 덮인 칸이라 쓸 수 없다
    const foot = `<row r="5" ht="24" customHeight="1"><c r="A5" s="1" t="inlineStr"><is><t>작성자 서명</t></is></c><c r="B5" s="1"/><c r="C5" s="1"/><c r="D5" s="1"/></row>`;
    const r = await fillXlsxTemplate(await zip(book({ rows: empty(2) + empty(3) + empty(4) + foot, merges: ['A5:D5'] })), {
      rows: { ...rowsOf(4), columns: { B: 'hazard' } },
    });
    expect(r.reason).toBeUndefined();
    expect(r.issues.map((i) => i.code)).not.toContain('MERGED_CELL_SKIPPED');
    expect(r.issues.map((i) => i.code)).toContain('ROWS_PUSHED');
    expect((await unzip(r.bytes!)).get(SHEET)).toContain('<mergeCell ref="A6:D6"/>');
  });

  it('밀린 바닥글은 값·서식이 그대로이고, 다시 채우면(빈 요청) 바이트가 같다', async () => {
    const first = await fillXlsxTemplate(await zip(S09()), { rows: rowsOf(5) });
    const again = await fillXlsxTemplate(first.bytes!, {});
    expect(Buffer.from(again.bytes!).equals(Buffer.from(first.bytes!))).toBe(true);
  });
});

describe('인쇄영역 밖 제자리 쓰기 경고(실서식 S09 at=21)', () => {
  const tpl = () => book({ rows: empty(2) + empty(3) + empty(4), printArea: "'평가표'!$A$1:$D$3" });
  it('쓴 마지막 자료 행이 인쇄영역 끝보다 아래면 PRINT_AREA_NOT_EXTENDED', async () => {
    const r = await fillXlsxTemplate(await zip(tpl()), { rows: rowsOf(3) });
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain('PRINT_AREA_NOT_EXTENDED');
  });
  it('인쇄영역 안에서 끝나면 경고 없음', async () => {
    const r = await fillXlsxTemplate(await zip(tpl()), { rows: rowsOf(2) });
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).not.toContain('PRINT_AREA_NOT_EXTENDED');
  });
});

describe('닫힌 밀기 — 거부(OVERFLOW 유지)', () => {
  // [이름, 덧붙일 것, 사유에 있어야 할 말] — 사유까지 단언해야 「원래 막혔던 것」과 구별된다
  const cases: [string, Partial<Opts>, RegExp][] = [
    ['수식이 있으면', { rows: empty(2) + empty(3) + empty(4) + footer + `<row r="9"><c r="A9"><f>1+1</f><v>2</v></c></row>` }, /수식/],
    ['조건부서식이 있으면', { beforeMargins: `<conditionalFormatting sqref="A2:A4"><cfRule type="expression" priority="1"><formula>TRUE</formula></cfRule></conditionalFormatting>` }, /조건부서식/],
    ['유효성이 있으면', { beforeMargins: `<dataValidations count="1"><dataValidation type="list" sqref="B2:B4"><formula1>"a,b"</formula1></dataValidation></dataValidations>` }, /유효성/],
    ['at 을 걸치는 병합이 있으면', { merges: ['A4:A5'] }, /걸치는 병합/],
    ['목록 밖 원소(autoFilter)가 있으면', { afterMerges: `<autoFilter ref="A1:B4"/>` }, /autoFilter/],
    ['내부 링크 location 이 단순 A1 이 아니면', { afterMerges: `<hyperlinks><hyperlink ref="A6" location="이름정의"/></hyperlinks>` }, /내부 링크/],
  ];
  for (const [name, extra, why] of cases) {
    it(`${name} 밀지 않고 OVERFLOW`, async () => {
      const r = await fillXlsxTemplate(await zip(S09(extra)), { rows: rowsOf(5) });
      expect(r.ok).toBe(false);
      expect(r.code).toBe('OVERFLOW');
      expect(r.overflowRows).toBe(2);
      expect(r.reason).toMatch(why);
    });
  }

  it('이름정의(인쇄 이름·#REF! 밖)가 있으면 OVERFLOW', async () => {
    const files = S09();
    files[WB] = files[WB].replace('</definedNames>', '<definedName name="목록">\'평가표\'!$B$2:$B$4</definedName></definedNames>');
    const r = await fillXlsxTemplate(await zip(files), { rows: rowsOf(5) });
    expect(r.code).toBe('OVERFLOW');
    expect(r.reason).toMatch(/이름정의/);
  });

  it('본문이 #REF! 뿐인 이름은 밀기를 막지 않고 바이트 그대로 둔다', async () => {
    const files = S09();
    files[WB] = files[WB].replace('</definedNames>', '<definedName name="찌꺼기">#REF!</definedName></definedNames>');
    const r = await fillXlsxTemplate(await zip(files), { rows: rowsOf(5) });
    expect(r.ok).toBe(true);
    expect((await unzip(r.bytes!)).get(WB)).toContain('<definedName name="찌꺼기">#REF!</definedName>');
  });

  it("overflow:'error' 면 밀지 않는다", async () => {
    const r = await fillXlsxTemplate(await zip(S09()), { rows: { ...rowsOf(5), overflow: 'error' } });
    expect(r.code).toBe('OVERFLOW');
  });
});

describe('닫힌 밀기 — 도형 고정점(S11 모양)', () => {
  it('윗변 행(0 기반 from/row) ≥ at−1 인 고정점만 from·to 행을 +n, 위 고정점·오프셋·xfrm 은 그대로', async () => {
    // 위(0~2행) = 그대로, 경계(4) = 밀림, 아래 oneCell(5) = 밀림
    const anchors = two(0, 2, 2) + two(4, 5, 3) + one(5, 4);
    const r = await fillXlsxTemplate(await zip(withDrawing(anchors)), { rows: rowsOf(5) });
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    const d = (await unzip(r.bytes!)).get(DRAW)!;
    expect(d).toBe(drawingXml(two(0, 2, 2) + two(6, 7, 3) + one(7, 4)));
    expect(r.preserved!.allSame).toBe(true);
  });

  it('도형만 밀어도 다시 채우면(빈 요청) 바이트가 같다', async () => {
    const first = await fillXlsxTemplate(await zip(withDrawing(two(4, 5, 3))), { rows: rowsOf(5) });
    const again = await fillXlsxTemplate(first.bytes!, {});
    expect(Buffer.from(again.bytes!).equals(Buffer.from(first.bytes!))).toBe(true);
  });

  it('밀 일이 없으면(용량 안) drawing 은 바이트 그대로', async () => {
    const files = withDrawing(two(4, 5, 3));
    const r = await fillXlsxTemplate(await zip(files), { rows: rowsOf(3) });
    expect(r.ok).toBe(true);
    expect((await unzip(r.bytes!)).get(DRAW)).toBe(files[DRAW]);
  });

  const reject: [string, string, RegExp][] = [
    ['at 을 걸치는 고정점(윗변 위·아래 끝 아래)', two(2, 5, 3), /걸치/],
    ['at 아래 editAs="absolute"', two(4, 5, 3, 'absolute'), /absolute|고정/],
    ['absoluteAnchor', `<xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="1" cy="1"/>${sp(3)}<xdr:clientData/></xdr:absoluteAnchor>`, /absoluteAnchor/],
    ['묶음 도형(grpSp)', two(4, 5, 3, undefined, `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="3" name="g"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr/>${sp(5)}</xdr:grpSp>`), /grpSp/],
    ['mc:AlternateContent', `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="a14">${two(4, 5, 3)}</mc:Choice></mc:AlternateContent>`, /AlternateContent/],
    ['셀에 이어진 도형 글(textlink)', two(4, 5, 3, undefined, sp(3).replace('textlink=""', 'textlink="$A$6"')), /textlink|셀 연결/],
    ['그림 하이퍼링크', two(4, 5, 3, undefined, sp(3).replace('name="도형 3"/>', 'name="도형 3"><a:hlinkClick r:id="rId1" xmlns:r="' + R + '"/></xdr:cNvPr>')), /하이퍼링크/],
  ];
  for (const [name, anchors, why] of reject) {
    it(`${name} 이 있으면 밀지 않고 OVERFLOW`, async () => {
      const r = await fillXlsxTemplate(await zip(withDrawing(anchors)), { rows: rowsOf(5) });
      expect(r.ok).toBe(false);
      expect(r.code).toBe('OVERFLOW');
      expect(r.reason).toMatch(why);
    });
  }

  it('위에만 있는 묶음 도형도 통합 거부(허용 목록 밖은 위치와 무관)', async () => {
    const g = two(0, 1, 3, undefined, `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="3" name="g"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr/>${sp(5)}</xdr:grpSp>`);
    const r = await fillXlsxTemplate(await zip(withDrawing(g + two(4, 5, 6))), { rows: rowsOf(5) });
    expect(r.code).toBe('OVERFLOW');
  });
});

describe.todo('닫힌 밀기 — 엑셀 COM 오라클 대조(로컬 윈도 전용 스크립트, 합성 반례 + S11 714/216)');
