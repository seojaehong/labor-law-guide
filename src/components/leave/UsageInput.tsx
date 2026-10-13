"use client";

import { useMemo, useState } from "react";

import {
  summarizeUsage,
  usageKindLabel,
  formatDays,
  HOURLY_LEAVE_CAUTION,
} from "@/lib/leave/leave-usage";
import type { UsageKind, UsageRecord } from "@/lib/leave/leave-usage";
import { StatusBadge } from "@/components/leave/LeaveUI";

/**
 * 반차·반반차·시간차 환산 입력 — **브라우저에서만 계산한다.**
 *
 * 입력 형식: 날짜 / 단위 / (시간차면) 시간
 *   2026-04-17  반차
 *   2026-06-11  시간차  2
 */

const SAMPLE = `2026-03-04\t종일
2026-04-17\t반차
2026-05-22\t반반차
2026-06-11\t시간차\t2`;

const KIND_MAP: Record<string, UsageKind> = {
  종일: "full",
  연차: "full",
  "1일": "full",
  반차: "half",
  반일: "half",
  반반차: "quarter",
  "반반": "quarter",
  시간차: "hourly",
  시간: "hourly",
};

function parseUsage(text: string): { records: UsageRecord[]; bad: string[] } {
  const records: UsageRecord[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\t|,|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 2) {
      bad.push(line);
      continue;
    }
    const kind = KIND_MAP[cols[1]];
    if (!kind) {
      bad.push(line);
      continue;
    }
    const hours = cols[2] !== undefined ? Number(cols[2].replace(/[^\d.]/g, "")) : undefined;
    records.push({
      date: cols[0],
      kind,
      hours: kind === "hourly" ? (Number.isFinite(hours) ? hours : undefined) : undefined,
    });
  }
  return { records, bad };
}

export function UsageInput() {
  const [text, setText] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("8");
  const [allowHalf, setAllowHalf] = useState(true);
  const [allowQuarter, setAllowQuarter] = useState(true);
  const [allowHourly, setAllowHourly] = useState(true);

  const { records, bad } = useMemo(() => parseUsage(text), [text]);
  const summary = useMemo(
    () =>
      records.length
        ? summarizeUsage(records, {
            hoursPerDay: Number(hoursPerDay) || 8,
            allowHalf,
            allowQuarter,
            allowHourly,
            hourlyIncrement: 1,
          })
        : null,
    [records, hoursPerDay, allowHalf, allowQuarter, allowHourly]
  );

  return (
    <section className="lv-input">
      <div className="lv-input__privacy">
        🔒 입력한 내용은 <strong>브라우저 안에서만</strong> 계산됩니다 — 서버로 올라가지 않습니다. 
      </div>

      <div className="lv-input__controls">
        <label className="lv-input__field">
          <span>1일 소정근로시간</span>
          <input
            type="number"
            min={1}
            max={24}
            step="0.5"
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <button type="button" className="lv-input__btn is-ghost" onClick={() => setText(SAMPLE)}>
          예시 채우기
        </button>
      </div>

      <div className="lv-clause__opts" style={{ margin: "0 0 10px" }}>
        {(
          [
            [allowHalf, setAllowHalf, "반차 허용"],
            [allowQuarter, setAllowQuarter, "반반차 허용"],
            [allowHourly, setAllowHourly, "시간차 허용"],
          ] as [boolean, (v: boolean) => void, string][]
        ).map(([on, set, label]) => (
          <label key={label} className={on ? "is-on" : undefined}>
            <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <textarea
        className="lv-input__area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder={"날짜\t단위\t시간(시간차만)\n2026-04-17\t반차"}
        aria-label="연차 사용 기록"
      />

      {bad.length > 0 && (
        <p className="lv-input__filenote" style={{ color: "var(--accent-warm)" }}>
          읽지 못한 줄 {bad.length}개 — 단위는 종일 · 반차 · 반반차 · 시간차 중 하나여야 합니다.
        </p>
      )}

      {summary && (
        <>
          <div className="lv-stats" style={{ marginTop: 12 }}>
            <div className="lv-stat">
              <span className="lv-stat__value">{formatDays(summary.totalDays)}</span>
              <span className="lv-stat__label">환산 합계</span>
            </div>
            <div className="lv-stat">
              <span className="lv-stat__value">{records.length}</span>
              <span className="lv-stat__label">기록 수</span>
            </div>
            <div
              className={
                summary.issues.length ? "lv-stat lv-stat--emphasis" : "lv-stat"
              }
            >
              <span className="lv-stat__value">{summary.issues.length}</span>
              <span className="lv-stat__label">규칙과 다름</span>
            </div>
          </div>

          <div className="lv-table" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>단위</th>
                  <th className="num">환산</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const issue = summary.issues.find((x) => x.index === i);
                  const days =
                    r.kind === "full"
                      ? 1
                      : r.kind === "half"
                        ? 0.5
                        : r.kind === "quarter"
                          ? 0.25
                          : r.hours !== undefined
                            ? r.hours / (Number(hoursPerDay) || 8)
                            : null;
                  return (
                    <tr key={i} data-diff={issue ? "true" : undefined}>
                      <td data-label="날짜">{r.date}</td>
                      <td data-label="단위">
                        {usageKindLabel(r.kind)}
                        {r.kind === "hourly" && r.hours !== undefined ? ` ${r.hours}h` : ""}
                      </td>
                      <td className="num" data-label="환산">
                        {days === null ? "—" : formatDays(days)}
                      </td>
                      <td className="basis" data-label="비고">
                        {issue ? issue.message : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {summary.needsHourlyCaution && (
            <p className="lv-input__note">
              <StatusBadge status="unknown" /> {HOURLY_LEAVE_CAUTION}
            </p>
          )}
        </>
      )}
    </section>
  );
}
