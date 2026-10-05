"use client";

import { useMemo, useState } from "react";

import { scheduleStatusLabel } from "@/lib/leave/leave-promotion";
import { checkedPromotionSchedule } from "@/lib/leave/leave-promotion-validation";
import type { LeaveKind } from "@/lib/leave/leave-promotion";
import { StatusBadge } from "@/components/leave/LeaveUI";

/**
 * 연차 사용촉진 일정 — **브라우저에서만 계산한다.**
 * 날짜만 대조하며 적법성(서면·도달·노무수령 거부)은 판정하지 않는다.
 */
export function PromotionInput() {
  const [usagePeriodEnd, setEnd] = useState("");
  const [kind, setKind] = useState<LeaveKind>("annual-15plus");
  const [sentOn, setSentOn] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [repliedOn, setRepliedOn] = useState("");
  const [secondOn, setSecondOn] = useState("");

  const result = useMemo(() => {
    if (!usagePeriodEnd) return null;
    return checkedPromotionSchedule({
      usagePeriodEnd,
      kind,
      firstNoticeSentOn: sentOn || undefined,
      firstNoticeReceivedOn: receivedOn || undefined,
      workerRepliedOn: repliedOn || undefined,
      secondNoticeSentOn: secondOn || undefined,
    });
  }, [usagePeriodEnd, kind, sentOn, receivedOn, repliedOn, secondOn]);

  return (
    <section className="lv-input">
      <div className="lv-input__privacy">
        🔒 입력한 내용은 <strong>브라우저 안에서만</strong> 계산됩니다 — 서버로 올라가지 않습니다. 
      </div>

      <div className="lv-form">
        <label className="lv-input__field">
          <span>연차 사용기간 종료일</span>
          <input
            type="date"
            value={usagePeriodEnd}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label className="lv-input__field">
          <span>대상</span>
          <select aria-label="연차 대상" value={kind} onChange={(e) => setKind(e.target.value as LeaveKind)}>
            <option value="annual-15plus">1년 이상 (15일+)</option>
            <option value="monthly-under-1year">1년 미만 월 단위</option>
          </select>
        </label>
        <label className="lv-input__field">
          <span>1차 촉구 발송일 (선택)</span>
          <input type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} />
        </label>
        <label className="lv-input__field">
          <span>근로자 수령일 (선택)</span>
          <input
            type="date"
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
          />
        </label>
        <label className="lv-input__field">
          <span>근로자 통보일 (선택)</span>
          <input type="date" value={repliedOn} onChange={(e) => setRepliedOn(e.target.value)} />
        </label>
        <label className="lv-input__field">
          <span>2차 통보 발송일 (선택)</span>
          <input type="date" value={secondOn} onChange={(e) => setSecondOn(e.target.value)} />
        </label>
      </div>

      {!usagePeriodEnd && (
        <p className="lv-input__note">
          사용기간 종료일을 넣으면 촉구 일정을 계산합니다. 회계연도로 운영하면 보통 12월 31일입니다.
        </p>
      )}

      {result && (
        <>
          <p style={{ margin: "14px 0 10px", fontSize: 14 }}>
            <StatusBadge
              status={
                result.overall === "match"
                  ? "match"
                  : result.overall === "diff"
                    ? "diff"
                    : result.overall === "out-of-scope"
                      ? "out-of-scope"
                      : "unknown"
              }
            />{" "}
            {scheduleStatusLabel(result.overall)}
          </p>

          <div className="lv-table">
            <table>
              <thead>
                <tr>
                  <th>단계</th>
                  <th>해야 하는 기간</th>
                  <th>실제</th>
                  <th>판정</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {result.windows.map((w) => (
                  <tr
                    key={w.label}
                    data-diff={w.status === "diff" ? "true" : undefined}
                  >
                    <td data-label="단계">{w.label}</td>
                    <td data-label="기간">
                      {w.from && w.to ? `${w.from} ~ ${w.to}` : w.to ? `~ ${w.to}` : "—"}
                    </td>
                    <td data-label="실제">{w.actual ?? "—"}</td>
                    <td data-label="판정">
                      <StatusBadge
                        status={
                          w.status === "match"
                            ? "match"
                            : w.status === "diff"
                              ? "diff"
                              : w.status === "out-of-scope"
                                ? "out-of-scope"
                                : "unknown"
                        }
                      />
                    </td>
                    <td className="basis" data-label="비고">
                      {w.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="lv-input__note">{result.disclaimer}</p>
        </>
      )}
    </section>
  );
}
