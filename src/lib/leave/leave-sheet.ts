/**
 * 엑셀 시트 → 표 → 대장 줄 파싱. **파일 API 없이 도는 순수 로직**만 둔다.
 *
 * 왜 컴포넌트에서 꺼냈나: 엑셀 업로드가 이 도구에서 사고가 가장 많이 나는 자리인데
 * (열 밀림·헤더 오판·날짜 형식·빈 칸), 컴포넌트 안에 있으면 **테스트가 한 줄도
 * 닿지 않는다.** next build 는 컴포넌트를 컴파일하지만 실행하지 않는다.
 * 여기로 옮겨야 "서식을 만들어 다시 읽어들이는" 왕복 검증이 가능해진다.
 */

export type ParsedRow = {
  name: string;
  hireDate: string;
  /** 대장에 적힌 일수. null = 칸이 비어 있음 */
  recordedDays: number | null;
  /** 숫자가 아닌 값이 적혀 있었다 (예: "미확인") — 0 으로 바꾸지 않는다 */
  recordedRaw?: string;
  raw: string;
  error?: string;
};

/** 2026-03-02 · 2026.3.2 · 20260302 · 2026/3/2 를 모두 받는다 */
export function normalizeDate(text: string): string | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const yy = Number(y), mm = Number(mo), dd = Number(d);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.getUTCDate() !== dd) return null;
  return iso;
}

export function parseLines(text: string): ParsedRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(/\t|,|\s{2,}/).map((c) => c.trim()).filter(Boolean);
      if (cols.length < 2) {
        return { name: cols[0] ?? "", hireDate: "", recordedDays: null, raw: line,
                 error: "이름과 입사일이 필요합니다" };
      }
      const name = cols[0];
      const hireDate = normalizeDate(cols[1]);
      if (!hireDate) {
        return { name, hireDate: "", recordedDays: null, raw: line,
                 error: `입사일을 읽을 수 없습니다: ${cols[1]}` };
      }
      // 대장값: 비어 있으면 null, 숫자면 숫자, 그 밖('미확인' 등)이면 원문을 남긴다.
      // 숫자만 뽑아내면 "미확인"이 0 이 되어 「확인 안 한 값」이 「0일」로 둔갑한다.
      const rawRecorded = cols[2];
      let recordedDays: number | null = null;
      let recordedRaw: string | undefined;
      if (rawRecorded !== undefined && rawRecorded !== "") {
        const cleaned = rawRecorded.replace(/일|days?/gi, "").trim();
        const n = Number(cleaned);
        if (cleaned !== "" && Number.isFinite(n)) {
          recordedDays = n;
        } else {
          recordedRaw = rawRecorded;
        }
      }
      return { name, hireDate, recordedDays, recordedRaw, raw: line };
    });
}

/**
 * 엑셀 셀 값 → 글자.
 *
 * 날짜는 **현지 기준**으로 뽑는다. toISOString 을 쓰면 KST 오전에 하루 전이 된다.
 * 수식 셀은 계산값(result), 서식 있는 문자열은 richText 를 이어 붙인다.
 */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return "";
    // ExcelJS decodes date-only serials as UTC dates, regardless of browser timezone.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return String(o.result ?? "");
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
    if (o.text !== undefined) return String(o.text ?? "");
  }
  return String(v);
}

/** exceljs 워크시트에서 최소한 필요한 부분만 (테스트에서 흉내낼 수 있게 좁게 잡는다) */
export interface SheetLike {
  eachRow(cb: (row: { cellCount: number; getCell(c: number): { value: unknown } }) => void): void;
}

/**
 * 워크시트 → 표(행 × 열).
 *
 * ★ 빈 셀을 건너뛰면 **열 위치가 당겨진다**(B열이 비면 C열 값이 B로 올라온다).
 *   셀을 1..cellCount 로 순회해 자리를 지키고, 값이 없으면 빈 글자를 넣는다.
 *   줄 전체가 비면 건너뛰고, 중간 빈 칸은 살린다.
 */
export function readGrid(ws: SheetLike): string[][] {
  const grid: string[][] = [];
  ws.eachRow((row) => {
    if (grid.length >= 5000 || row.cellCount > 100) throw new Error('엑셀은 5,000행·100열 이하로 나누어 읽어 주세요.');
    const cells: string[] = [];
    for (let c = 1; c <= row.cellCount; c += 1) {
      cells.push(cellText(row.getCell(c).value).trim());
    }
    if (cells.some((c) => c !== "")) grid.push(cells);
  });
  return grid;
}

/**
 * 첫 줄이 제목줄인지 본다.
 *
 * 명시적인 열 이름이 있을 때만 제목으로 본다. 첫 직원의 날짜 오타는 행 오류로 남긴다.
 */
export function looksLikeHeader(grid: string[][]): boolean {
  const first = grid[0] ?? [];
  const labels = first.map(cell => cell.trim().replace(/\s+/g, '').toLowerCase());
  const name = labels.some(cell => /^(이름|성명|직원|직원명|사원명|name|employeename)$/.test(cell));
  const hire = labels.some(cell => /^(입사일|입사일자|입사날짜|입사연월일|채용일|hiredate|dateofhire)$/.test(cell));
  return name && hire;
}

/** 표 + 열 매핑 → 입력창 텍스트 */
export function buildText(
  grid: string[][],
  skipFirst: boolean,
  cName: number,
  cHire: number,
  cDays: number | null
): string {
  return grid
    .slice(skipFirst ? 1 : 0)
    .map((row) => {
      const cells = [row[cName] ?? "", row[cHire] ?? ""];
      if (cDays !== null) cells.push(row[cDays] ?? "");
      return cells.join("\t");
    })
    .filter((l) => l.replace(/\t/g, "").trim() !== "")
    .join("\n");
}
