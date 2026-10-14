import { describe, expect, it } from "vitest";
import { pickReason } from "@/lib/reason-pick";

// Synthetic stored-tag combinations; these are not verified legal case classifications.
describe("pickReason", () => {
  it("징계양정 사건은 근로자성보다 비위행위가 먼저다", () => {
    expect(pickReason(["worker_status", "misconduct"], "disciplinary_severity")).toBe("misconduct");
  });
  it("성희롱 조치의무 사건은 부당노동행위가 아니다", () => {
    expect(pickReason(["union_activity", "sexual_harassment", "discrimination", "no_dismissal"], "misconduct")).toBe("sexual_harassment");
  });
  it("해고 존재 여부가 쟁점이면 해고부존재/사직", () => {
    expect(pickReason(["transfer", "no_dismissal", "contract_expiry", "worker_status"], "no_dismissal")).toBe("no_dismissal");
  });
  it("시용 본채용 거부는 근로자성이 아니라 수습", () => {
    expect(pickReason(["worker_status", "probation"], "worker_status")).toBe("probation");
  });
  it("무기계약 전환 후 기간만료 종료는 계약만료", () => {
    expect(pickReason(["worker_status", "contract_expiry"], "dismissal_validity")).toBe("contract_expiry");
  });
  it("generic dismissal validity must not override a specific stored violence tag", () => {
    expect(pickReason(["no_dismissal", "violence"], "dismissal_validity")).toBe("violence");
    expect(pickReason(["no_dismissal", "violence"], "no_dismissal")).toBe("no_dismissal");
  });
  it("explicit primary category wins only if stored, and unknown tags stay unknown",()=>{
    expect(pickReason(['violence','probation'],'probation')).toBe('probation');
    expect(pickReason(['unknown'],'unknown')).toBeNull();
  });
  it("근로자성만 있으면 그대로 근로자성", () => {
    expect(pickReason(["worker_status"], "worker_status")).toBe("worker_status");
  });
  it("빈 배열·null 은 null", () => {
    expect(pickReason([], "misconduct")).toBeNull();
    expect(pickReason(null)).toBeNull();
  });
});
