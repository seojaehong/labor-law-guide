"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { compareRow } from "@/lib/leave/annual-leave";
import { buildText, looksLikeHeader, parseLines, readGrid } from "@/lib/leave/leave-sheet";
import type { ParsedRow } from "@/lib/leave/leave-sheet";
import { downloadXlsx } from "@/lib/leave/leave-xlsx";
import { downloadLeaveTemplate } from "@/lib/leave/leave-template-xlsx";
import { todayLocal } from "@/lib/leave/leave-today";
import {
  WORKSPACES_CHANGED,
  getActiveWorkspace,
  getMembers,
  setMembers,
} from "@/lib/leave/leave-workspaces";
import type { Workspace } from "@/lib/leave/leave-workspaces";
import { StatusBadge } from "@/components/leave/LeaveUI";
import { MAX_FILE_BYTES, validateDocArchive } from '@/lib/laws/doc-io';

/**
 * 연차 대장 직접 입력 — **브라우저에서만 계산한다.**
 *
 * 🔒 서버로 아무것도 보내지 않는다.
 *    엑셀·이미지·PDF 를 서버에 올리면 고객사 직원정보가 외부로 나간다.
 *    붙여넣은 글자는 이 페이지를 벗어나지 않으며, 새로고침하면 사라진다.
 *
 * 받는 것: 이름 · 입사일 (+ 대장에 적힌 연차일수가 있으면 대조까지)
 * 구분자: 탭 / 쉼표 / 여러 칸 공백 — 엑셀에서 복사하면 탭으로 들어온다.
 */

const SAMPLE = `홍길동\t2019-03-02\t18
김영희\t2026-03-16\t15
박철수\t2024-01-08\t16`;

/**
 * 오늘 날짜 — **현지 시각 기준**.
 * toISOString() 은 UTC 라서 KST 오전 9시 이전에는 하루 전 날짜가 나온다.
 * 연차 발생일 당일에는 결과가 달라지므로 반드시 현지 날짜를 쓴다.
 */
const TEMPLATE_KEY = "work-patterns.leave.template.v1";

type Template = { colName: number; colHire: number; colDays: number | null };

function loadTemplate(): Template | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    return raw ? (JSON.parse(raw) as Template) : null;
  } catch {
    return null;
  }
}
function saveTemplate(t: Template): void {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t));
  } catch {
    /* 저장 못 해도 계산에는 지장이 없다 */
  }
}

function toCsv(
  rows: { row: ParsedRow; result: ReturnType<typeof compareRow> | null }[],
  asOf: string
): string {
  const head = ["이름", "입사일", "기준일", "발생일수", "대장기재", "차이", "판정", "적용근거"];
  const lines = rows.map(({ row, result }) => {
    if (!result) return [row.name, row.hireDate, asOf, "", "", "", "읽지 못함", row.error ?? ""];
    const hasRec = row.recordedDays !== null;
    return [
      row.name,
      row.hireDate,
      asOf,
      String(result.calculatedDays),
      // ★ 대장에 「미확인」이라고 적혀 있으면 그 원문을 그대로 싣는다.
      //   「대장값 없음」으로 쓰면 원본 대장을 왜곡한 파일이 사무소를 돈다.
      hasRec ? String(row.recordedDays) : (row.recordedRaw ?? ""),
      hasRec ? String(result.diff) : "",
      hasRec
        ? (result.verdict === "diff" ? "차이 있음" : "일치")
        : row.recordedRaw
          ? "대조 못 함(숫자 아님)"
          : "대장값 없음",
      result.basisLabel,
    ];
  });
  return [head, ...lines]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

export function LeaveInput() {
  const [text, setText] = useState("");
  // 기준일은 **마운트 후에** 채운다. SSR 은 서버 시계(UTC)로 렌더하는데,
  // 프로덕션 React 는 하이드레이션 속성 불일치를 되돌리지 않는 경우가 있어
  // KST 00~09시에 서버가 찍은 하루 전 날짜가 그대로 굳을 수 있다.
  const [asOf, setAsOf] = useState("");
  useEffect(() => setAsOf(todayLocal()), []);
  const [copied, setCopied] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  /** 엑셀에서 읽은 원본 표 — 열 매핑을 다시 할 수 있게 들고 있는다 */
  const [sheet, setSheet] = useState<string[][] | null>(null);
  /** 열 매핑 (0-based). null = 안 씀 */
  const [colName, setColName] = useState(0);
  const [colHire, setColHire] = useState(1);
  const [colDays, setColDays] = useState<number | null>(2);
  const [skipFirst, setSkipFirst] = useState(true);

  /**
   * 엑셀 업로드 — **브라우저에서만 읽는다.** 파일을 서버로 보내지 않는다.
   * exceljs 를 동적 import 해서 첫 화면 용량에 영향을 주지 않는다.
   */
  async function handleFile(file: File) {
    setReading(true);
    setFileNote(null);
    
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('엑셀 파일은 10MB 이하만 읽을 수 있습니다.');
      const data = await file.arrayBuffer();
      validateDocArchive(data);
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(data);
      const ws = wb.worksheets[0];
      if (!ws) {
        
        setFileNote("시트를 찾지 못했습니다.");
        return;
      }
      const grid = readGrid(ws);
      if (!grid.length) {
        
        setFileNote("읽을 수 있는 행이 없습니다. 이름과 입사일 열이 있는지 확인해주세요.");
        return;
      }

      
      const looksHeader = looksLikeHeader(grid);
      setSheet(grid);
      setSkipFirst(looksHeader);
      // 저장된 사무소 설정이 있으면 그 열 매핑을 먼저 쓴다
      const saved = loadTemplate();
      const cn = saved?.colName ?? 0;
      const ch = saved?.colHire ?? 1;
      const cd = saved?.colDays ?? 2;
      setColName(cn); setColHire(ch); setColDays(cd);
      setText(buildText(grid, looksHeader, cn, ch, cd));
      setFileNote(
        `${file.name} — ${grid.length}행을 읽었습니다${looksHeader ? " (첫 줄은 제목으로 보고 제외)" : ""}. ` +
          "열이 잘못 잡혔으면 아래에서 바꾸세요."
      );
    } catch (error) {
      
      setFileNote(error instanceof Error ? `파일을 읽지 못했습니다. ${error.message} 기존 입력은 유지됩니다.` : "이 파일은 읽지 못했습니다. xlsx 형식인지 확인하시거나 내용을 붙여넣어 주세요.");
    } finally {
      setReading(false);
    }
  }

  const rows = useMemo(() => parseLines(text), [text]);

  /** 지금 고른 사업장 — 읽어낸 직원은 여기로 들어간다 */
  const [ws, setWs] = useState<Workspace | null>(null);
  const editorWorkspace = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const sync = () => {
      const next = getActiveWorkspace();
      const id = next?.id ?? null;
      if (editorWorkspace.current !== id) {
        const initialWithoutWorkspace = editorWorkspace.current === undefined && !next;
        editorWorkspace.current = id;
        if (!initialWithoutWorkspace) {
          setText(getMembers(next).map(member => `${member.name}\t${member.hireDate}`).join("\n"));
          setSheet(null);
          setFileNote(null);
        }
      }
      setWs(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    sync();
    window.addEventListener(WORKSPACES_CHANGED, sync);
    return () => window.removeEventListener(WORKSPACES_CHANGED, sync);
  }, []);

  // 읽어낸 직원을 세션 명부에 넣는다 — 퇴직정산 화면에서 같은 사람을 다시
  // 입력하지 않게 하기 위해서다. 같은 탭에서만 유지되고 서버로 나가지 않는다.
  //
  // ★ 합치지 않고 **덮어쓴다.** 이 입력창의 내용이 곧 명부 전체다.
  //   합치면 타이핑 중간 상태("홍" → "홍길" → "홍길동")가 전부 남아 드롭다운이
  //   쓰레기로 찬다. 날짜 오타를 고쳐도 틀린 것이 같이 남는다.
  useEffect(() => {
    if (editorWorkspace.current !== (ws?.id ?? null)) return;
    setMembers(
      ws,
      rows
        .filter((r) => !r.error && r.hireDate)
        .map((r) => ({ name: r.name, hireDate: r.hireDate }))
    );
  }, [rows, ws]);
  const results = useMemo(
    () =>
      rows.map((r) => {
        // 기준일은 마운트 직후 한 프레임 비어 있다. 그때 계산을 돌리면
        // 멀쩡한 줄이 "읽지 못함"으로 잘못 찍힌다.
        if (!asOf || r.error || !r.hireDate) return { row: r, result: null };
        try {
          const cmp = compareRow(
            { name: r.name, hireDate: r.hireDate, recordedDays: r.recordedDays ?? 0 },
            asOf
          );
          return { row: r, result: cmp };
        } catch (e) {
          return {
            row: { ...r, error: e instanceof Error ? e.message : "계산할 수 없습니다" },
            result: null,
          };
        }
      }),
    [rows, asOf]
  );

  // ★ compareRow 는 계산 실패 시 verdict "error" 를 돌려준다.
  //   그것을 "diff 가 아니면 일치" 로 처리하면 **틀린 답을 맞다고 표시**한다.
  //   (기준일보다 미래 입사 등) → 반드시 따로 센다.

  const ok = results.filter((x) => x.result && x.result.verdict !== "error");
  const usable = ok;
  const withRecorded = ok.filter((x) => x.row.recordedDays !== null);
  const diffs = withRecorded.filter((x) => x.result!.verdict === "diff");
  const problems = results.filter((x) => !x.result || x.result.verdict === "error");

  // ★ 2026-09-24 — 대장 칸에 숫자가 아닌 값(「미확인」·「-」)이 적힌 줄은
  //   recordedDays 가 null 이라 withRecorded 에서 빠지고, verdict 가 error 도
  //   아니라 problems 에도 안 들어간다. 그런데 usable(「N명 계산」)에는 들어간다.
  //   200명 중 20명이 「미확인」이면 「200명 계산 · 차이 3명」이 뜨고 사용자는
  //   197명이 맞다고 결론 낸다. 실제로 대조된 건 180명이다. 거짓 안심이다.
  const uncompared = ok.filter((x) => x.row.recordedDays === null && x.row.recordedRaw);
  const noRecord = ok.filter((x) => x.row.recordedDays === null && !x.row.recordedRaw);
  const comparedCount = withRecorded.length;

  return (
    <section className="lv-input">
      <div className="lv-input__privacy">
        🔒 붙여넣은 내용과 엑셀 파일은 <strong>브라우저 안에서만</strong> 처리됩니다 — 서버로 올라가지 않습니다. 
      </div>

      <div className="lv-input__controls">
        <label className="lv-input__field">
          <span>기준일</span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value || todayLocal())}
          />
        </label>
        <label className="lv-input__btn lv-input__file">
          {reading ? "읽는 중…" : "엑셀 파일 열기"}
          <input
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="lv-input__btn is-ghost"
          onClick={() => {  void downloadLeaveTemplate(); }}
        >
          빈 서식 내려받기
        </button>
        <button type="button" className="lv-input__btn is-ghost" onClick={() => setText(SAMPLE)}>
          예시 채우기
        </button>
        {text && (
          <button type="button" className="lv-input__btn is-ghost" onClick={() => setText("")}>
            지우기
          </button>
        )}
      </div>

      {!text && !sheet && (
        <p className="lv-input__note">
          쓰시던 대장을 그대로 올리셔도 됩니다. <strong>열 이름이 달라도</strong> 어느 칸이
          이름·입사일인지 화면에서 지정하시면 됩니다. 대장이 없으시면{" "}
          <button
            type="button"
            className="lv-linklike"
            onClick={() => {  void downloadLeaveTemplate(); }}
          >
            빈 서식
          </button>
          을 받아 채워 넣으세요.
        </p>
      )}

      {fileNote && <p className="lv-input__filenote">{fileNote}</p>}

      {sheet && (
        <div className="lv-map">
          <p className="lv-map__title">어느 열을 쓸까요</p>
          <div className="lv-map__grid">
            {(
              [
                ["이름", colName, setColName, false],
                ["입사일", colHire, setColHire, false],
                ["대장 연차일수", colDays, setColDays, true],
              ] as [string, number | null, (v: never) => void, boolean][]
            ).map(([label, val, set, optional]) => (
              <label key={label} className="lv-input__field">
                <span>{label}</span>
                <select
                  value={val === null ? "" : String(val)}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    (set as (x: number | null) => void)(v);
                    const next = {
                      colName: label === "이름" ? (v as number) : colName,
                      colHire: label === "입사일" ? (v as number) : colHire,
                      colDays: label === "대장 연차일수" ? v : colDays,
                    };
                    setText(buildText(sheet, skipFirst, next.colName, next.colHire, next.colDays));
                  }}
                >
                  {optional && <option value="">쓰지 않음</option>}
                  {(sheet[0] ?? []).map((_, i) => (
                    <option key={i} value={i}>
                      {String.fromCharCode(65 + i)}열
                      {sheet[0]?.[i] ? ` · ${sheet[0][i].slice(0, 10)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="lv-map__foot">
            <label className="lv-map__check">
              <input
                type="checkbox"
                checked={skipFirst}
                onChange={(e) => {
                  setSkipFirst(e.target.checked);
                  setText(buildText(sheet, e.target.checked, colName, colHire, colDays));
                }}
              />
              첫 줄은 제목이라 제외
            </label>
            <button
              type="button"
              className="lv-input__btn is-ghost"
              onClick={() => {
                saveTemplate({ colName, colHire, colDays });
                setFileNote("이 열 배치를 기억했습니다. 다음에 파일을 열면 그대로 적용됩니다.");
              }}
            >
              이 배치 기억하기
            </button>
          </div>
        </div>
      )}

      <textarea
        className="lv-input__area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={"이름\t입사일\t연차일수(선택)\n홍길동\t2019-03-02\t18"}
        aria-label="이름과 입사일 붙여넣기"
      />

      {results.length > 0 && (
        <>
          <div className="lv-input__summary">
            <span>{usable.length}명 계산</span>
            {comparedCount > 0 && (
              <span className={diffs.length ? "is-diff" : undefined}>
                대조 {comparedCount}명 중 차이 {diffs.length}명
              </span>
            )}
            {uncompared.length > 0 && (
              <span className="is-diff">대조 못 함 {uncompared.length}명</span>
            )}
            {noRecord.length > 0 && <span>대장값 없음 {noRecord.length}명</span>}
            {problems.length > 0 && (
              <span className="is-diff">계산 불가 {problems.length}줄</span>
            )}
          </div>
          {uncompared.length > 0 && (
            <p className="lv-input__note">
              대장 칸에 숫자가 아닌 값이 적힌 <strong>{uncompared.length}명</strong>은 계산값과
              대조하지 못했습니다. 「차이 {diffs.length}명」은 대조한 {comparedCount}명 기준입니다.
            </p>
          )}

          <div className="lv-table">
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>입사일</th>
                  <th className="num">부여일수</th>
                  <th className="num">대장</th>
                  <th>판정</th>
                  <th>적용 근거</th>
                </tr>
              </thead>
              <tbody>
                {results.map((x, i) => {
                  const r = x.row;
                  if (!x.result) {
                    return (
                      <tr key={i} data-diff="true">
                        <td data-label="이름">{r.name || "—"}</td>
                        <td data-label="입사일" colSpan={4}>
                          {r.error}
                        </td>
                        <td className="basis" data-label="원문">{r.raw}</td>
                      </tr>
                    );
                  }
                  const res = x.result;
                  if (res.verdict === "error") {
                    return (
                      <tr key={i} data-diff="true">
                        <td data-label="이름">{r.name}</td>
                        <td data-label="입사일">{r.hireDate}</td>
                        <td className="num" data-label="부여일수">—</td>
                        <td className="num" data-label="대장">
                          {r.recordedDays ?? r.recordedRaw ?? "—"}
                        </td>
                        <td data-label="판정">
                          <StatusBadge status="unknown" />
                        </td>
                        <td className="basis" data-label="근거">
                          {res.errorMessage ?? "계산할 수 없습니다"}
                        </td>
                      </tr>
                    );
                  }
                  const hasRecorded = r.recordedDays !== null;
                  return (
                    <tr key={i} data-diff={hasRecorded && res.verdict === "diff" ? "true" : undefined}>
                      <td data-label="이름">{r.name}</td>
                      <td data-label="입사일">{r.hireDate}</td>
                      <td className="num" data-label="부여일수">
                        <strong>{res.calculatedDays}</strong>
                      </td>
                      <td className="num" data-label="대장">
                        {hasRecorded ? r.recordedDays : (r.recordedRaw ?? "—")}
                      </td>
                      <td data-label="판정">
                        {hasRecorded ? (
                          <StatusBadge status={res.verdict === "diff" ? "diff" : "match"} />
                        ) : r.recordedRaw ? (
                          <StatusBadge status="unknown" />
                        ) : (
                          <span className="lv-input__muted">대장값 없음</span>
                        )}
                      </td>
                      <td className="basis" data-label="근거">{res.basisLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 2026-09-24 — 재홍님 지시로 화면 연락 안내를 내렸다.
              「이 차이가 미사용수당 청구로 이어지는지…」 문구가 도구 화면에서
              영업처럼 읽혔다. 문의 경로 자체는 더 쉬운 방식으로 다시 만든다.
              (.lv-offer 스타일은 그때 재사용할 수 있게 남겨 둔다) */}

          <p className="lv-roster__note" style={{ marginTop: 12 }}>
            읽은 직원 <strong>{usable.length}명</strong>을{" "}
            {ws ? <>「{ws.name}」 명부에 담았습니다. </> : <>명부에 담았습니다. </>}
            <a href="/tools/leave/settlement">퇴직 연차 정산</a> 화면에서 골라 쓸 수 있습니다.
            {ws?.remember
              ? " 이 브라우저에 남습니다."
              : " 탭을 닫으면 사라집니다(위에서 기억하기를 켜면 남습니다)."}
          </p>

          <div className="lv-input__export">
            <button
              type="button"
              className="lv-input__btn"
              onClick={async () => {
                
                const csv = toCsv(results, asOf);
                try {
                  await navigator.clipboard.writeText(csv.replace(/","/g, "\t").replace(/"/g, ""));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "복사했습니다" : "엑셀로 복사"}
            </button>
            <button
              type="button"
              className="lv-input__btn"
              onClick={() => {
                
                void downloadXlsx(`연차계산_${asOf}`, [
                  {
                    name: "연차 계산",
                    title: "연차 발생일수 계산 결과",
                    subtitle: `기준일 ${asOf} · 입사일 기준 · 근로기준법 제60조`,
                    header: ["이름", "입사일", "발생일수", "대장 기재", "차이", "판정", "적용 근거"],
                    widths: [14, 13, 10, 10, 8, 13, 46],
                    rows: results.map(({ row, result }) =>
                      !result
                        ? [row.name || "", row.hireDate || "", "", "", "", "읽지 못함", row.error ?? ""]
                        : [
                            row.name,
                            row.hireDate,
                            result.calculatedDays,
                            // 대장에 적힌 원문을 보존한다 — 「미확인」을 「대장값 없음」으로
                            // 바꿔 쓰면 원본을 왜곡한 파일이 사무소 안을 돈다.
                            row.recordedDays ?? row.recordedRaw ?? "",
                            row.recordedDays !== null ? result.diff : "",
                            row.recordedDays !== null
                              ? result.verdict === "diff"
                                ? "차이 있음"
                                : "일치"
                              : row.recordedRaw
                                ? "대조 못 함(숫자 아님)"
                                : "대장값 없음",
                            result.basisLabel,
                          ]
                    ),
                    emphasizeRows: results
                      .map((x, i) =>
                        x.result && x.row.recordedDays !== null && x.result.verdict === "diff"
                          ? i
                          : -1
                      )
                      .filter((i) => i >= 0),
                    notes: [
                      `· 계산 ${usable.length}명 · 대조 ${comparedCount}명 · 대조 못 함 ${uncompared.length}명 · 대장값 없음 ${noRecord.length}명 · 계산 불가 ${problems.length}줄`,
                      "· 「대조 못 함」은 대장 칸에 숫자가 아닌 값이 적혀 있어 계산값과 맞대보지 못한 줄입니다. 원문을 그대로 실었습니다.",
                      "· 계산: yellowenvelope.kr/tools/leave — 노무법인 위너스 공인노무사 서재홍 · abc@winhr.co.kr",
                      "· 상시 5인 이상 사업장, 1주 소정근로시간 15시간 이상 근로자를 전제로 한 참고 계산입니다.",
                      "· 입사일 기준 「발생일수」입니다. 이월·사용분을 뺀 잔여일수와는 다릅니다.",
                      "· 출근율 80% 미만 구간, 육아휴직 등 특수 출결은 조건이 달라집니다.",
                      "· 회계연도로 운영하는 사업장의 퇴직 정산은 별도 화면에서 계산합니다.",
                      "· 임금채권 확정이나 분쟁 사안은 별도 검토가 필요합니다.",
                    ],
                  },
                ]);
              }}
            >
              엑셀 내려받기
            </button>
            <button
              type="button"
              className="lv-input__btn is-ghost lv-print-btn"
              onClick={() => {  window.print(); }}
            >
              인쇄 · PDF 저장
            </button>
          </div>

          <p className="lv-input__note">
            부여일수는 <strong>기준일이 속한 연차년도</strong> 기준입니다. 입사 후 누계나
            잔여일수가 아니므로, 대장과 비교할 때는 같은 기간·같은 기준인지 확인해 주세요.
          </p>
        </>
      )}
    </section>
  );
}
