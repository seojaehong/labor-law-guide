/**
 * 연차 사용 기록 붙여넣기 파서 — 화면(UsageInput)에서 옮겼다. 시험에서 부르려고 lib 에 둔다.
 *
 * 입력 형식: 날짜 / 단위 / (시간차면) 시간
 *   2026-04-17  반차
 *   2026-06-11  시간차  2
 */
import type { UsageKind, UsageRecord } from "./leave-usage";

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

export function parseUsage(text: string): { records: UsageRecord[]; bad: string[] } {
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
    // 시간 칸 — 숫자(부호 포함) 뒤에 「시간」·「h」만 붙일 수 있다. 부호를 지워 음수를 양수로 받지 않는다(엔진이 행 오류로 막는다).
    let hours: number | undefined;
    if (kind === "hourly" && cols[2] !== undefined) {
      const m = /^([+-]?\d+(?:\.\d+)?)\s*(?:시간|h|H)?$/.exec(cols[2]);
      if (!m) {
        bad.push(line);
        continue;
      }
      hours = Number(m[1]);
    }
    records.push({
      date: cols[0],
      kind,
      hours,
    });
  }
  return { records, bad };
}
