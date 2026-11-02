"""건강보험 자격 취득(별지 6호)·상실(별지 8호) 신고서 좌표 지도를 만든다.

좌표 = probe_form.py(sanjae-apply) 실측(261102). 단위 pt, 원점 쪽 왼쪽 위. 쪽 크기 841×595(가로).
사람 칸은 4줄. 키 이름 = <칸>_<줄번호 1~4>.
사용: python3 scripts/nhis-forms/build_maps.py <서식폴더(pdf 있는 곳)> <지도 출력폴더>
"""
import hashlib
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
src_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def text(x, y, size=8, maxWidth=None, label=None):
    s = {"kind": "text", "page": 1, "x": x, "y": y, "size": size}
    if maxWidth:
        s["maxWidth"] = maxWidth
    if label:
        s["label"] = label
    return s


def check(x, y, label=None, size=9):
    s = {"kind": "check", "page": 1, "x": x, "y": y, "size": size}
    if label:
        s["label"] = label
    return s


# ── 별지 8호 상실 ───────────────────────────────────────────────
def loss_map(pdf: Path) -> dict:
    s = {
        # 제목 줄 보험 선택
        "title_nps": check(179.4, 88.0, "국민연금 [ ] 사업장가입자 자격상실 신고서"),
        "title_ei": check(178.8, 107.2, "고용보험 [ ] 근로자 피보험자격상실 신고서"),
        "title_nhis": check(523.0, 88.0, "건강보험 [ ] 직장가입자 자격상실 신고서"),
        "title_ia": check(523.0, 107.2, "산재보험 [ ] 근로자 자격상실 신고서"),
        # 사업장
        "biz_mgmt_no": text(142, 195, 9, 154, "사업장관리번호"),
        "biz_name": text(303, 195, 9, 155, "명칭"),
        "biz_tel": text(465, 195, 9, 154, "전화번호"),
        "biz_fax": text(626, 195, 9, 154, "FAX번호"),
        "biz_addr": text(142, 220, 9, 495, "소재지"),
        "biz_zip": text(695, 214, 9, 80, "우편번호"),
        "agent_name": text(142, 247, 9, 155, "보험사무대행기관 명칭"),
        "agent_no": text(303, 247, 9, 155, "보험사무대행기관 번호"),
        # 작성일·신고인
        "date_y": text(670, 504, 9, None, "년"),
        "date_m": text(718, 504, 9, None, "월"),
        "date_d": text(758, 504, 9, None, "일"),
        "reporter_name": text(362, 523, 9, 86, "신고인ㆍ확인인(사용자ㆍ대표자) 성명"),
        "by_agent": check(531.9, 518.7, "[ ]보험사무대행기관"),
        "agent_sign_name": text(630, 523, 9, 92, "보험사무대행기관 성명"),
    }
    for i in range(4):
        n = i + 1
        t = 330.5 + 34.8 * i  # 줄 위
        b = t + 21.5  # 기준선(가운데)
        s |= {
            f"seq_{n}": text(65, b, 8, 12, "일련번호"),
            f"name_{n}": text(82, b, 8, 32, "성명"),
            f"rrn_{n}": text(119, b, 7.5, 81, "주민등록번호(외국인등록번호ㆍ국내거소신고번호)"),
            f"tel_{n}": text(205, b, 7.5, 61, "전화번호(휴대전화번호)"),
            f"loss_date_{n}": text(271, b, 8, 55, "상실연월일(YYYY.MM.DD)"),
            f"nps_code_{n}": text(338, b, 8, 20, "국민연금 상실부호"),
            f"nps_first_day_{n}": check(381.0, t + 24.9, "초일취득ㆍ당월상실자 납부여부 희망[ ]"),
            f"nhis_code_{n}": text(410, b, 8, 20, "건강보험 상실부호"),
            f"nhis_pay_cur_{n}": text(434, b, 8, 50, "건강보험 해당 연도 보수 총액"),
            f"nhis_months_cur_{n}": text(493, b, 8, 22, "건강보험 해당 연도 근무개월수"),
            f"nhis_pay_prev_{n}": text(519, b, 8, 50, "건강보험 전년도 보수 총액"),
            f"nhis_months_prev_{n}": text(578, b, 8, 22, "건강보험 전년도 근무개월수"),
            f"ei_reason_{n}": text(604, b, 7, 62, "고용ㆍ산재 상실사유 구체적 사유"),
            f"ei_code_{n}": text(675, b, 8, 18, "고용ㆍ산재 상실사유 구분코드"),
            f"ei_pay_cur_{n}": text(697, t + 13, 7, 40, "해당 연도 보수 총액 고용보험"),
            f"ia_pay_cur_{n}": text(697, t + 30.5, 7, 40, "해당 연도 보수 총액 산재보험"),
            f"ei_pay_prev_{n}": text(741, t + 13, 7, 40, "전년도 보수 총액 고용보험"),
            f"ia_pay_prev_{n}": text(741, t + 30.5, 7, 40, "전년도 보수 총액 산재보험"),
        }
    return {
        "form_id": "NHIS_8_LOSS",
        "source_file": pdf.name,
        "source_sha256": sha(pdf),
        "page_size": {"width": 841.0, "height": 595.0},
        "_about": "국민건강보험법 시행규칙 [별지 제8호서식] <개정 2022.10.26.> 1쪽(앞쪽). 법제처 별표서식 flSeq=169566361. 261102 probe 실측. 사람 4줄(줄 높이 34.8pt).",
        "slots": s,
        "stamps": {
            "applicant": {"page": 1, "x": 479.7, "y": 522.5, "size": 30},
            "agent": {"page": 1, "x": 754.5, "y": 522.5, "size": 30},
        },
    }


# ── 별지 6호 취득 ───────────────────────────────────────────────
def acq_map(pdf: Path) -> dict:
    s = {
        "title_nps": check(169.8, 81.6, "국민연금 [ ] 사업장가입자 자격취득 신고서"),
        "title_nhis": check(523.6, 81.6, "건강보험 [ ] 직장가입자 자격취득 신고서"),
        "title_ei": check(168.1, 101.8, "고용보험 [ ] 근로자 피보험자격취득 신고서"),
        "title_ia": check(523.6, 101.8, "산재보험 [ ] 근로자 자격취득 신고서"),
        "biz_mgmt_no": text(123, 180, 9, 200, "사업장관리번호"),
        "biz_name": text(329, 180, 9, 150, "명칭"),
        "biz_unit_name": text(485, 180, 9, 135, "단위사업장 명칭"),
        "biz_branch_name": text(627, 180, 9, 155, "영업소 명칭"),
        "biz_addr": text(123, 205, 9, 520, "소재지"),
        "biz_zip": text(695, 205, 9, 85, "우편번호"),
        "biz_tel": text(186, 225, 9, 290, "전화번호"),
        "biz_fax": text(548, 225, 9, 230, "팩스번호"),
        "agent_no": text(150, 254, 9, 170, "보험사무대행기관 번호"),
        "agent_name": text(355, 254, 9, 125, "보험사무대행기관 명칭"),
        "date_y": text(671, 521, 9, None, "년"),
        "date_m": text(720, 521, 9, None, "월"),
        "date_d": text(760, 521, 9, None, "일"),
        "reporter_name": text(345, 533, 9, 100, "신고인(사용자ㆍ대표자) 성명"),
        "by_agent": check(541.0, 529.6, "[ ]보험사무대행기관"),
        "agent_sign_name": text(640, 533, 9, 85, "보험사무대행기관 성명"),
    }
    for i in range(4):
        n = i + 1
        t = 326.2 + 42.5 * i
        s |= {
            f"seq_{n}": text(62, t + 25, 8, 10, "구분"),
            f"name_{n}": text(75, t + 15, 8, 70, "성명"),
            f"rrn_{n}": text(75, t + 37, 7.5, 70, "주민등록번호(외국인등록번호ㆍ국내거소신고번호)"),
            f"nationality_{n}": text(150, t + 15, 7, 30, "국적"),
            f"visa_{n}": text(150, t + 37, 7, 30, "체류자격"),
            f"ceo_yes_{n}": check(194.2, t + 11.0, "대표자 여부 [ ]예"),
            f"ceo_no_{n}": check(194.2, t + 31.8, "대표자 여부 [ ]아니오"),
            f"monthly_pay_{n}": text(240, t + 25, 8.5, 80, "월 소득액(소득월액ㆍ보수월액ㆍ월 평균보수액)(원)"),
            f"acq_date_{n}": text(328, t + 25, 8, 44, "자격취득일(YYYY.MM.DD)"),
            f"nps_on_{n}": check(401.7, t + 9.5, "[ ]국민연금"),
            f"nhis_on_{n}": check(473.6, t + 10.0, "[ ]건강보험"),
            f"ei_on_{n}": check(627.5, t + 9.0, "[ ]고용보험"),
            f"ia_on_{n}": check(627.5, t + 21.0, "[ ]산재보험"),
            f"nps_code_{n}": text(382, t + 40, 7.5, 20, "국민연금 자격취득부호"),
            f"nps_job_{n}": text(414, t + 40, 7.5, 20, "국민연금 특수직종부호"),
            f"nps_occ_pension_{n}": text(444, t + 40, 7.5, 18, "국민연금 직역연금부호"),
            f"nhis_code_{n}": text(477, t + 40, 7.5, 24, "건강보험 자격취득부호"),
            f"nhis_reduce_{n}": text(515, t + 40, 7.5, 26, "건강보험 보험료 감면부호"),
            f"nhis_acct_{n}": text(549, t + 40, 7, 28, "공무원ㆍ교직원 회계명/부호"),
            f"nhis_jobname_{n}": text(583, t + 40, 7, 31, "공무원ㆍ교직원 직종명/부호"),
            f"ei_job_{n}": text(620, t + 40, 7.5, 30, "고용ㆍ산재 직종"),
            f"ei_hours_{n}": text(656, t + 40, 7.5, 20, "1주 소정근로시간"),
            f"ei_contract_end_{n}": text(680, t + 40, 7, 34, "계약종료연월(계약직만 작성)"),
            f"ei_levy_code_{n}": text(726, t + 40, 7.5, 34, "보험료 부과구분 부호"),
            f"ei_levy_reason_{n}": text(764, t + 40, 7, 20, "보험료 부과구분 사유"),
        }
    return {
        "form_id": "NHIS_6_ACQ",
        "source_file": pdf.name,
        "source_sha256": sha(pdf),
        "page_size": {"width": 841.0, "height": 595.0},
        "_about": "국민건강보험법 시행규칙 [별지 제6호서식] <개정 2025.12.1.> 1쪽(5쪽 중 1쪽). 법제처 별표서식 flSeq=169566339. 261102 probe 실측. 사람 4줄(줄 높이 42.5pt). 피부양자 신청(5쪽)은 뺐다.",
        "slots": s,
        "stamps": {
            "applicant": {"page": 1, "x": 477.4, "y": 530.5, "size": 30},
            "agent": {"page": 1, "x": 756.0, "y": 530.5, "size": 30},
        },
    }


for fid, build in (("NHIS_8_LOSS", loss_map), ("NHIS_6_ACQ", acq_map)):
    m = build(src_dir / f"{fid}.pdf")
    m["source_file"] = f"{fid}.pdf"
    (out_dir / f"{fid}.json").write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    print(fid, len(m["slots"]), "칸")
