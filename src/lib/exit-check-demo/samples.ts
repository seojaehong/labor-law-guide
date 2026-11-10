// 생성물 — scripts/exit-check/sync-engine.mjs 가 쓴다. 손으로 고치지 않는다.
// 원본: ~/dev/exit-check @cab1cce fixtures/S01·S03/ (꾸며 낸 합성 자료, manifest synthetic: true).
// 화면에 싣는 예시는 이 파일의 표본뿐이다. 실행 입구(./run)는 file_sha256 과 바이트가 같을 때만 엔진 사본을 부른다.
// files 는 manifest 의 path → CSV 줄 배열이다. LF 한 글자로 이어 붙이면 원본 바이트와 같다(마지막 빈 문자열 = 끝 줄바꿈).

export interface DemoSample {
  manifest: Record<string, unknown>;
  files: Record<string, readonly string[]>;
  file_sha256: Record<string, string>;
}

export const DEMO_SAMPLES: Readonly<Record<string, DemoSample>> = {
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
    },
    "file_sha256": {
      "annual_leave_ledger.csv": "sha256:9135b982fe84087b1fe0b06399dda50ce9d49df543a1f32f73d9ca3ebc7ddb5a",
      "final_payroll_settlement.csv": "sha256:d2f5b2d4bf294a636669705878675126c2baff48841e475f6db84d20d3f0e255",
      "insurance_loss.csv": "sha256:8236f1d312bf625c85ce05c8d57c90f2ff4cb5b113172be4dfef803501a809e1",
      "personnel_exit.csv": "sha256:0e6fed01c4ecb024f0965ab2b1d447d003dc3f04c025584cdfb2190763cdd380"
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
    },
    "file_sha256": {
      "annual_leave_ledger.csv": "sha256:b98d5f4d5e85dbc82f2adee98049534a711c098fd6155b59bf983005f76c36f4",
      "final_payroll_settlement.csv": "sha256:5f14a72d380c0f450aabd891fd93cc40ede96c6544afaf5f5a2e45a55ae23e9c",
      "insurance_loss.csv": "sha256:e4269f1719f0092c2fd5e0ab7ffd000a9b8a122de7a6afe24f17ed68fce32b8c",
      "personnel_exit.csv": "sha256:570c6303015b4630bf696fce1906e7550f356ac40f03f50fdc28609cc5b4c28f"
    }
  }
};
