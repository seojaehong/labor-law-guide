# 엑셀 COM 오라클(로컬 윈도 전용, 설계 v2.1 §2-5b 「검증 추가」).
# 원본을 엑셀로 열어 같은 자리에 「행 삽입」한 결과와 우리 fill 결과를 비교한다.
# 비교 = 셀 값(넣은 행·우리가 쓴 행 제외)·병합·하이퍼링크·수동 쪽 나눔·인쇄영역·인쇄제목·도형 Top/Left/Height/Width/Placement.
# 쓰기: python scripts/office/excel-oracle.py <원본.xlsx> <우리.xlsx> <시트> <at> <n> [<건너뛸 첫 행> <건너뛸 끝 행>]
# 결과: 첫 줄 JSON {"same": bool, "diffs": [...]} · 종료 코드 0 = 같음, 1 = 다름, 2 = 실행 오류.
import json
import os
import re
import shutil
import sys
import tempfile

sys.stdout.reconfigure(encoding='utf-8')

XL_PAGE_BREAK_MANUAL = -4135


def snapshot(ws, skip):
    lo, hi = skip
    used = ws.UsedRange
    r0, c0 = used.Row, used.Column
    vals = used.Value
    cells = {}
    merges = set()
    if vals is not None:
        if not isinstance(vals, tuple):
            vals = ((vals,),)
        for i, row in enumerate(vals):
            r = r0 + i
            for j, v in enumerate(row):
                c = c0 + j
                if lo <= r <= hi:
                    continue
                if v is not None and v != '':
                    cells[f'{r},{c}'] = str(v)
    for area in iter_merges(ws, used):
        a = area.Row
        b = area.Row + area.Rows.Count - 1
        if b < lo or a > hi:
            merges.add(area.Address)
    links = sorted(f'{h.Range.Address}|{h.SubAddress}|{h.Address}' for h in ws.Hyperlinks)
    breaks = sorted(ws.HPageBreaks(i + 1).Location.Row for i in range(ws.HPageBreaks.Count) if ws.HPageBreaks(i + 1).Type == XL_PAGE_BREAK_MANUAL)
    shapes = sorted(
        f'{s.Name}|{round(s.Top, 1)}|{round(s.Left, 1)}|{round(s.Height, 1)}|{round(s.Width, 1)}|{s.Placement}'
        for s in ws.Shapes
    )
    return {
        'cells': cells,
        'merges': sorted(merges),
        'links': links,
        'breaks': breaks,
        'printArea': ws.PageSetup.PrintArea,
        'printTitles': ws.PageSetup.PrintTitleRows,
        'shapes': shapes,
    }


def iter_merges(ws, used):
    seen = set()
    for cell in used.Cells:
        if cell.MergeCells:
            area = cell.MergeArea
            if area.Address not in seen:
                seen.add(area.Address)
                yield area


A1 = re.compile(r'^(\$?[A-Z]{1,3}\$?)(\d+)(?::(\$?[A-Z]{1,3}\$?)(\d+))?$')


def shift_link(link, sheet, at, n):
    rng, sub, addr = link.split('|', 2)
    if not sub:
        return link
    bang = sub.rfind('!')
    name = sub[:bang].strip("'").replace("''", "'") if bang >= 0 else sheet
    ref = sub[bang + 1:] if bang >= 0 else sub
    m = A1.match(ref)
    if name != sheet or not m:
        return link
    mv = lambda r: str(int(r) + n if int(r) >= at else int(r))
    out = m.group(1) + mv(m.group(2)) + (':' + m.group(3) + mv(m.group(4)) if m.group(3) else '')
    return f"{rng}|{sub[:bang + 1] if bang >= 0 else ''}{out}|{addr}"


def grow_end(area, at, n):
    if not area:
        return area
    out = []
    for part in area.split(','):
        m = re.match(r'^(.*:\$?[A-Z]{1,3}\$?)(\d+)$', part)
        out.append(f'{m.group(1)}{int(m.group(2)) + n}' if m and int(m.group(2)) == at - 1 else part)
    return ','.join(out)


def main():
    if len(sys.argv) < 6:
        print(json.dumps({'error': 'usage'}))
        return 2
    src, ours, sheet, at, n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
    skip = (int(sys.argv[6]), int(sys.argv[7])) if len(sys.argv) >= 8 else (at, at + n - 1)
    import win32com.client as win32

    tmp = tempfile.mkdtemp(prefix='xloracle_')
    excel = win32.DispatchEx('Excel.Application')
    excel.Visible = False
    excel.DisplayAlerts = False
    try:
        expect_path = os.path.join(tmp, 'expect.xlsx')
        shutil.copyfile(src, expect_path)
        wb = excel.Workbooks.Open(expect_path, UpdateLinks=0)
        ws = wb.Worksheets(sheet)
        ws.Rows(f'{at}:{at + n - 1}').Insert()
        exp = snapshot(ws, skip)
        wb.Close(SaveChanges=False)
        ours_path = os.path.join(tmp, 'ours.xlsx')
        shutil.copyfile(ours, ours_path)
        wb2 = excel.Workbooks.Open(ours_path, UpdateLinks=0, CorruptLoad=0)
        got = snapshot(wb2.Worksheets(sheet), skip)
        wb2.Close(SaveChanges=False)
    finally:
        excel.Quit()
        shutil.rmtree(tmp, ignore_errors=True)
    # 의도된 차이 하나: 엑셀은 행 삽입 때 시트 안 링크의 위치 글(SubAddress)을 옮기지 않는다(261126 실측).
    # 우리는 같은 시트 단순 A1 위치를 함께 옮겨 링크가 원래 칸(바닥글 등)을 계속 가리키게 한다(설계 §2-5b).
    # 그래서 엑셀 쪽 SubAddress 에 같은 밀기 규칙을 적용한 뒤 비교한다.
    exp['links'] = sorted(shift_link(x, sheet, at, n) for x in exp['links'])
    # 의도된 차이 둘: 인쇄영역·인쇄제목 끝 행이 정확히 at−1 이면 엑셀은 늘리지 않지만(실측) 우리는 새 행이 인쇄되도록 끝을 +n 한다(§2-5b).
    exp['printArea'] = grow_end(exp['printArea'], at, n)
    diffs = []
    for k in exp:
        if exp[k] != got[k]:
            if isinstance(exp[k], dict):
                ks = sorted(set(exp[k]) ^ set(got[k]) | {x for x in exp[k] if x in got[k] and exp[k][x] != got[k][x]})
                diffs.append({'what': k, 'count': len(ks), 'first': ks[:5]})
            elif isinstance(exp[k], list):
                diffs.append({'what': k, 'onlyExcel': sorted(set(exp[k]) - set(got[k]))[:5], 'onlyOurs': sorted(set(got[k]) - set(exp[k]))[:5]})
            else:
                diffs.append({'what': k, 'excel': exp[k], 'ours': got[k]})
    print(json.dumps({'same': not diffs, 'diffs': diffs, 'shapes': len(exp['shapes'])}, ensure_ascii=False))
    return 0 if not diffs else 1


if __name__ == '__main__':
    sys.exit(main())
