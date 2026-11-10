// 생성물 — scripts/exit-check/sync-engine.mjs 가 쓴다. 손으로 고치지 않는다.
// 원본: ~/dev/exit-check @cab1cce fixtures/S*/ (전부 합성 자료). 싣지 않은 fixture 와 이유는 engine-fingerprint.json 의 skipped_scenarios.
// files 는 manifest 의 path → CSV 줄 배열이다. LF 한 글자로 이어 붙이면 원본 바이트와 같다(마지막 빈 문자열 = 끝 줄바꿈).
// 줄 배열로 싣는 까닭: 이 저장소는 체크아웃 때 줄바꿈을 CRLF 로 바꿀 수 있고, 바뀌면 파일 해시와 core 해시가 달라진다.

export interface ExitCheckScenario {
  id: string;
  manifest: Record<string, unknown>;
  files: Record<string, string[]>;
}

export const EXIT_CHECK_SCENARIOS: readonly ExitCheckScenario[] = [
  {
    "id": "S01",
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
  {
    "id": "S02",
    "manifest": {
      "scenario": "S02",
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
        "C-A,W-02,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-02,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S02-W-02-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-02,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S03",
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
  },
  {
    "id": "S04",
    "manifest": {
      "scenario": "S04",
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
        "C-A,W-04,1,2026-01-01/2026-09-25,15,10,5,2026-10-17T09:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-04,1,2026-09-01,2026-09-25,2026-10-02,paid,SET-S04-W-04-1,2026-10-17T09:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-04,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-04,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-04,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of,record_revision",
        "C-A,W-04,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00,1",
        "C-A,W-04,1,2026-09-25,2026-09-25,exited,2026-10-16T09:00:00+09:00,2",
        ""
      ]
    }
  },
  {
    "id": "S05",
    "manifest": {
      "scenario": "S05",
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
        "C-A,W-05,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-05,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S05-W-05-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-05,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-05,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-05,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of,source_system",
        "C-A,W-05,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00,HRIS",
        "C-A,W-05,1,2026-10-15,2026-09-30,exited,2026-10-01T09:00:00+09:00,APPOINTMENT_REGISTER",
        ""
      ]
    }
  },
  {
    "id": "S06",
    "manifest": {
      "scenario": "S06",
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
        "C-A,W-06,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-06,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S06-W-06-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-06,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-06,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-06,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-06,1,2026-09-30,2026-09-27,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S07",
    "manifest": {
      "scenario": "S07",
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
        "C-A,W-07,1,2025-01-01/2025-12-31,15,10,5,2025-12-31T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-07,1,2025-12-01,2025-12-31,2026-01-08,paid,SET-S07-W-07-1,2026-01-08T18:00:00+09:00",
        "C-A,W-07,2,2026-09-01,2026-09-30,2026-10-08,paid,SET-S07-W-07-2,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-07,1,NPS,2026-01-01,2026-01-12T10:00:00+09:00,processed,2026-01-14T10:00:00+09:00,2026-01-14T10:00:00+09:00",
        "C-A,W-07,1,NHIS,2026-01-01,2026-01-12T10:00:00+09:00,processed,2026-01-14T10:00:00+09:00,2026-01-14T10:00:00+09:00",
        "C-A,W-07,1,EI,2026-01-01,2026-01-12T10:00:00+09:00,processed,2026-01-14T10:00:00+09:00,2026-01-14T10:00:00+09:00",
        "C-A,W-07,2,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-07,2,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-07,2,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-07,1,2025-12-31,2025-12-31,exited,2026-01-02T09:00:00+09:00",
        "C-A,W-07,2,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S09",
    "manifest": {
      "scenario": "S09",
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
        "C-A,W-09,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        "C-A,W-09C,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-09C,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S09-W-09C-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-09C,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-09C,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-09C,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-09,1,,2026-09-30,on_leave,2026-10-01T09:00:00+09:00",
        "C-A,W-09C,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S10",
    "manifest": {
      "scenario": "S10",
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
        "C-A,W-10,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-10,1,2026-09-01,2026-09-30,2026-10-05,paid,SET-S10-W-10-1,2026-10-08T18:00:00+09:00",
        "C-A,W-10,1,2026-09-01,2026-09-30,2026-10-10,paid,SET-S10-W-10-1b,2026-10-10T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-10,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-10,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-10,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-10,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S12",
    "manifest": {
      "scenario": "S12",
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
        "C-A,W-12,,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-12,2026-09-01,2026-09-30,2026-10-08,paid,SET-S12-W-12-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-12,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-12,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-12,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-12,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S13",
    "manifest": {
      "scenario": "S13",
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
        "C-A,W-13,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-13,1,2026-09-01,2026-09-30,2026-10-14,paid,SET-S13-W-13-1,2026-10-14T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-13,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-13,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-13,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-13,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S14",
    "manifest": {
      "scenario": "S14",
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
        "C-A,W-14,1,2026-01-01/2026-09-30,15,10,5,",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-14,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S14-W-14-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-14,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-14,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-14,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-14,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S15",
    "manifest": {
      "scenario": "S15",
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
        },
        {
          "family": "insurance_loss",
          "path": null,
          "source_type": "user_description",
          "file_sha256": null,
          "source_locator": null,
          "inline_rows": [
            {
              "company_key": "C-A",
              "worker_token": "W-15",
              "employment_sequence": "1",
              "scheme": "EI",
              "insurance_loss_date": "2026-10-01",
              "submission_at": "2026-10-12T10:00:00+09:00",
              "receipt_or_processing_status": "processed",
              "observed_at": "2026-10-14T10:00:00+09:00",
              "source_as_of": "2026-10-14T10:00:00+09:00"
            }
          ],
          "note": "담당자가 화면에서 옮겨 적은 값. 원문 파일·위치 없음"
        }
      ],
      "column_aliases": {},
      "approvals": []
    },
    "files": {
      "annual_leave_ledger.csv": [
        "company_key,worker_token,employment_sequence,leave_period,granted_days,used_days,remaining_days,ledger_as_of",
        "C-A,W-15,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-15,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S15-W-15-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-15,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-15,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-15,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S16",
    "manifest": {
      "scenario": "S16",
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
      "column_aliases": {
        "personnel_exit": {
          "사업장키": "company_key",
          "근로자토큰": "worker_token",
          "고용차수": "employment_sequence",
          "퇴직일": "employment_end_date",
          "마지막근로일": "last_worked_date",
          "재직상태": "employment_status",
          "기준시각": "source_as_of"
        },
        "final_payroll_settlement": {
          "사업장키": "company_key",
          "근로자토큰": "worker_token",
          "고용차수": "employment_sequence",
          "정산기간시작": "pay_period_start",
          "정산기간종료": "pay_period_end",
          "지급일": "payment_date",
          "정산상태": "settlement_status",
          "정산참조번호": "settlement_reference",
          "기준시각": "source_as_of"
        },
        "insurance_loss": {
          "사업장키": "company_key",
          "근로자토큰": "worker_token",
          "고용차수": "employment_sequence",
          "보험제도": "scheme",
          "상실일": "insurance_loss_date",
          "제출시각": "submission_at",
          "접수처리상태": "receipt_or_processing_status",
          "관측시각": "observed_at",
          "기준시각": "source_as_of"
        },
        "annual_leave_ledger": {
          "사업장키": "company_key",
          "근로자토큰": "worker_token",
          "고용차수": "employment_sequence",
          "연차기간": "leave_period",
          "발생일수": "granted_days",
          "사용일수": "used_days",
          "잔여일수": "remaining_days",
          "대장기준시각": "ledger_as_of"
        }
      },
      "approvals": []
    },
    "files": {
      "annual_leave_ledger.csv": [
        "사업장키,근로자토큰,고용차수,연차기간,발생일수,사용일수,잔여일수,대장기준시각",
        "C-A,W-16,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "사업장키,근로자토큰,고용차수,정산기간시작,정산기간종료,지급일,정산상태,정산참조번호,기준시각",
        "C-A,W-16,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S16-W-16-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "사업장키,근로자토큰,고용차수,보험제도,상실일,제출시각,접수처리상태,관측시각,기준시각",
        "C-A,W-16,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-16,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-16,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "사업장키,근로자토큰,고용차수,퇴직일,마지막근로일,재직상태,기준시각",
        "C-A,W-16,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S17",
    "manifest": {
      "scenario": "S17",
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
      "approvals": [
        {
          "key": "C-A|W-17|1",
          "scheme": "NHIS",
          "status": "NOT_APPLICABLE",
          "reason_code": "scheme_not_applicable",
          "approved_by": "approver-token-01",
          "approved_at": "2026-10-02T10:00:00+09:00"
        }
      ]
    },
    "files": {
      "annual_leave_ledger.csv": [
        "company_key,worker_token,employment_sequence,leave_period,granted_days,used_days,remaining_days,ledger_as_of",
        "C-A,W-17,1,2026-01-01/2026-09-30,15,10,5,2026-09-30T18:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-17,1,2026-09-01,2026-09-30,2026-10-08,paid,SET-S17-W-17-1,2026-10-08T18:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-17,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-17,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-17,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S18",
    "manifest": {
      "scenario": "S18",
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
          "family": "personnel_exit",
          "path": "personnel_exit_v2.csv",
          "source_type": "system_extract",
          "supersedes": "personnel_exit.csv"
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
        "C-A,W-04,1,2026-01-01/2026-09-25,15,10,5,2026-10-17T09:00:00+09:00",
        ""
      ],
      "final_payroll_settlement.csv": [
        "company_key,worker_token,employment_sequence,pay_period_start,pay_period_end,payment_date,settlement_status,settlement_reference,source_as_of",
        "C-A,W-04,1,2026-09-01,2026-09-25,2026-10-02,paid,SET-S04-W-04-1,2026-10-17T09:00:00+09:00",
        ""
      ],
      "insurance_loss.csv": [
        "company_key,worker_token,employment_sequence,scheme,insurance_loss_date,submission_at,receipt_or_processing_status,observed_at,source_as_of",
        "C-A,W-04,1,NPS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-04,1,NHIS,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        "C-A,W-04,1,EI,2026-10-01,2026-10-12T10:00:00+09:00,processed,2026-10-14T10:00:00+09:00,2026-10-14T10:00:00+09:00",
        ""
      ],
      "personnel_exit.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-04,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ],
      "personnel_exit_v2.csv": [
        "company_key,worker_token,employment_sequence,employment_end_date,last_worked_date,employment_status,source_as_of",
        "C-A,W-04,1,2026-09-25,2026-09-25,exited,2026-10-16T09:00:00+09:00",
        ""
      ]
    }
  },
  {
    "id": "S19",
    "manifest": {
      "scenario": "S19",
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
          "source_type": "system_extract",
          "employment_end_date_basis": "DAY_AFTER_LAST_DAY"
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
        "C-A,W-01,1,2026-10-01,2026-09-30,exited,2026-10-01T09:00:00+09:00",
        ""
      ]
    }
  }
];
