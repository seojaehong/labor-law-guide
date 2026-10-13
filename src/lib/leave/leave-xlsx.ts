/**
 * 연차 결과 → 엑셀(.xlsx) 내려받기.
 *
 * 🔒 브라우저에서만 만든다. 서버로 아무것도 보내지 않는다.
 *    exceljs 를 동적 import 하므로 첫 화면 용량에 영향이 없다.
 *
 * CSV 대신 xlsx 인 이유: 노무사·인사담당자는 엑셀에서 바로 열어 손본다.
 * CSV 는 한글 인코딩 사고가 나고, 열 너비·서식이 없어 그대로 쓰기 어렵다.
 */

export interface SheetSpec {
  name: string;
  /** 표 제목 줄 (선택) */
  title?: string;
  /** 제목 아래 한 줄 설명 (선택) */
  subtitle?: string;
  header: string[];
  rows: (string | number | null)[][];
  /** 강조할 행 인덱스 (rows 기준 0부터) — 차이 나는 행 */
  emphasizeRows?: number[];
  /** 열 너비 (글자 수) */
  widths?: number[];
  /** 표 아래 덧붙일 문장들 (근거·한계 고지) */
  notes?: string[];
}

/**
 * 시트 명세 → 워크북. **브라우저 API 를 쓰지 않는다.**
 * 내려받기(Blob/URL)와 분리해 둔 이유: 서식을 만들어 다시 읽어들이는 왕복 검증을
 * node 에서 돌릴 수 있어야 한다. 엑셀 경로는 이 도구에서 사고가 가장 많은 자리다.
 */
export async function buildWorkbook(sheets: SheetSpec[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "일의 무늬";
  wb.created = new Date();

  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name, {
      views: [{ state: "frozen", ySplit: 0 }],
    });

    let r = 1;

    if (spec.title) {
      const cell = ws.getCell(r, 1);
      cell.value = spec.title;
      cell.font = { bold: true, size: 14 };
      ws.mergeCells(r, 1, r, Math.max(spec.header.length, 1));
      r += 1;
    }
    if (spec.subtitle) {
      const cell = ws.getCell(r, 1);
      cell.value = spec.subtitle;
      cell.font = { size: 10, color: { argb: "FF667085" } };
      ws.mergeCells(r, 1, r, Math.max(spec.header.length, 1));
      r += 1;
    }
    if (spec.title || spec.subtitle) r += 1; // 한 줄 띄우기

    const headerRowIndex = r;
    const headerRow = ws.getRow(headerRowIndex);
    headerRow.values = spec.header;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1ED" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFCFC7B9" } } };
    });
    headerRow.commit();
    r += 1;

    spec.rows.forEach((row, i) => {
      const dataRow = ws.getRow(r);
      dataRow.values = row.map((v) => (v === null ? "" : v));
      const emphasized = spec.emphasizeRows?.includes(i);
      dataRow.eachCell((cell) => {
        cell.alignment = { vertical: "top", wrapText: true };
        cell.font = { size: 10 };
        if (emphasized) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0DF" } };
        }
        cell.border = { bottom: { style: "hair", color: { argb: "FFE2DED5" } } };
      });
      dataRow.commit();
      r += 1;
    });

    if (spec.notes?.length) {
      r += 1;
      for (const note of spec.notes) {
        const cell = ws.getCell(r, 1);
        cell.value = note;
        cell.font = { size: 9, color: { argb: "FF667085" } };
        cell.alignment = { wrapText: true, vertical: "top" };
        ws.mergeCells(r, 1, r, Math.max(spec.header.length, 1));
        r += 1;
      }
    }

    const widths = spec.widths ?? spec.header.map(() => 16);
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    // 헤더에 자동 필터 — 인원이 많을 때 바로 거를 수 있다
    if (spec.rows.length > 1) {
      ws.autoFilter = {
        from: { row: headerRowIndex, column: 1 },
        to: { row: headerRowIndex, column: spec.header.length },
      };
    }
  }

  return wb;
}

export async function downloadXlsx(fileName: string, sheets: SheetSpec[]): Promise<void> {
  const wb = await buildWorkbook(sheets);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
