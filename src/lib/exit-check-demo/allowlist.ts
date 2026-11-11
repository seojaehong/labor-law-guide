// 생성물 — scripts/exit-check/sync-engine.mjs 가 쓴다. 손으로 고치지 않는다.
// 원본: ~/dev/exit-check @cab1cce. 화면 예시 표본(./samples)의 허용 해시 — 실행 입구(./run)만 가져온다.
// files: 파일별 sha256(바이트) · manifest: 원본 빌드의 canonicalSha256(manifest). 지문 samples 절과 같은 값이다(시험이 본다).

export interface SampleAllow {
  readonly files: Readonly<Record<string, string>>;
  readonly manifest: string;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}

export const SAMPLE_ALLOWLIST: Readonly<Record<string, SampleAllow>> = freeze({
  "S01": {
    "files": {
      "annual_leave_ledger.csv": "sha256:9135b982fe84087b1fe0b06399dda50ce9d49df543a1f32f73d9ca3ebc7ddb5a",
      "final_payroll_settlement.csv": "sha256:d2f5b2d4bf294a636669705878675126c2baff48841e475f6db84d20d3f0e255",
      "insurance_loss.csv": "sha256:8236f1d312bf625c85ce05c8d57c90f2ff4cb5b113172be4dfef803501a809e1",
      "personnel_exit.csv": "sha256:0e6fed01c4ecb024f0965ab2b1d447d003dc3f04c025584cdfb2190763cdd380"
    },
    "manifest": "sha256:edb928bcc6571915ef414d4a3c16013522ccf0675180ae9a4275bee1254ba3e6"
  },
  "S03": {
    "files": {
      "annual_leave_ledger.csv": "sha256:b98d5f4d5e85dbc82f2adee98049534a711c098fd6155b59bf983005f76c36f4",
      "final_payroll_settlement.csv": "sha256:5f14a72d380c0f450aabd891fd93cc40ede96c6544afaf5f5a2e45a55ae23e9c",
      "insurance_loss.csv": "sha256:e4269f1719f0092c2fd5e0ab7ffd000a9b8a122de7a6afe24f17ed68fce32b8c",
      "personnel_exit.csv": "sha256:570c6303015b4630bf696fce1906e7550f356ac40f03f50fdc28609cc5b4c28f"
    },
    "manifest": "sha256:687047c6ab57629db6fdde6497e660c026d2b609327dbf9abf14cf17e9320378"
  }
});
