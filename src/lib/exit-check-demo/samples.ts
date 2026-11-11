// 생성물 — scripts/exit-check/sync-engine.mjs 가 쓴다. 손으로 고치지 않는다.
// 원본: ~/dev/exit-check @cab1cce fixtures/S01·S03/ (꾸며 낸 합성 자료, manifest synthetic: true).
// 화면에 싣는 예시는 이 파일의 표본뿐이다. 실행 입구(./run)만 가져오고, 바이트·manifest 가 ./allowlist 의 해시와 같을 때만 엔진 사본을 부른다.
// 허용 해시는 이 파일에 두지 않는다 — 표본을 바꾸는 쪽이 해시를 함께 바꾸지 못하게. 값은 깊게 얼려 실행 중에 바꿀 수 없다.
// files 는 manifest 의 path → CSV 줄 배열이다. LF 한 글자로 이어 붙이면 원본 바이트와 같다(마지막 빈 문자열 = 끝 줄바꿈).

export interface DemoSample {
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, readonly string[]>>;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}

export const DEMO_SAMPLES: Readonly<Record<string, DemoSample>> = freeze({
  "S01": {
    "manifest": {
      "scenario": "S01",
      "synthetic": true,
      "cutoff_at": "2026-10-20T23:59:59+09:00",
      "rule_version": "fixture-0.1",
      "required_schemes": [
        "NPS",
        "NHIS",
        "EI"
      ],
      "inputs": [
        {
          "family": "personnel_exit",
          "path": "personnel_exit.csv",
          "source_type": "system_extract"
        },
        {
          "family": "final_payroll_settlement",
          "path": "final_payroll_settlement.csv",
          "source_type": "system_extract"
        },
        {
          "family": "insurance_loss",
          "path": "insurance_loss.csv",
          "source_type": "system_extract"
        },
        {
          "family": "annual_leave_ledger",
          "path": "annual_leave_ledger.csv",
          "source_type": "system_extract"
        }
      ],
      "column_aliases": {},
      "approvals": []
    },
    "files": {
      "annual_leave_ledger.csv": [
        "company_key,worker_token,employment_sequence,leave_period,granted_days,used_days,remaining_days,ledger_as_of",
        "C-A,W-01,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-01,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S01-W-01-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-01,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-01,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-01,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-01,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  "S03": {
    "manifest": {
      "scenario": "S03",
      "synthetic": true,
      "cutoff_at": "2026-10-20T23:59:59+09:00",
      "rule_version": "fixture-0.1",
      "required_schemes": [
        "NPS",
        "NHIS",
        "EI"
      ],
      "inputs": [
        {
          "family": "personnel_exit",
          "path": "personnel_exit.csv",
          "source_type": "system_extract"
        },
        {
          "family": "final_payroll_settlement",
          "path": "final_payroll_settlement.csv",
          "source_type": "system_extract"
        },
        {
          "family": "insurance_loss",
          "path": "insurance_loss.csv",
          "source_type": "system_extract"
        },
        {
          "family": "annual_leave_ledger",
          "path": "annual_leave_ledger.csv",
          "source_type": "system_extract"
        }
      ],
      "column_aliases": {},
      "approvals": []
    },
    "files": {
      "annual_leave_ledger.csv": [
        "company_key,worker_token,employment_sequence,leave_period,granted_days,used_days,remaining_days,ledger_as_of",
        "C-A,W-03,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-03,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S03-W-03-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-03,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-03,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-03,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  }
});
