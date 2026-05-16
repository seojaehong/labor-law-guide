#!/usr/bin/env python3
"""
nlrc_decisions misconduct 사건 10K건에 sub_reason TEXT[] 부여.
holding_points + key_issue + tags 기반 정규식 매칭.
"""
import os, re, sys, json
import urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

ENV = "/home/ubuntu/work-orchestrator/repos/labor-law-guide/.env.local"

def load_env():
    env = {}
    with open(ENV) as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, _, v = line.strip().partition("=")
                env[k] = v
    return env

SUB_PATTERNS = [
    ("information_leak", re.compile(r"기밀.*유출|기밀.*누설|영업비밀|기술유출|정보.*누설|정보.*유출|업무상\s*비밀|기밀.*전달|자료.*외부.*제공")),
    ("falsification", re.compile(r"문서.*위조|허위.*보고|허위.*신고|허위.*기재|허위.*작성|조작|위조|허위.*공문서|허위.*진단서|사문서.*위조|진단서.*위조")),
    ("fraud_embezzlement", re.compile(r"횡령|배임|금품.*수수|뇌물|공금.*유용|착복|절취|사기|금품.*수령|업무상.*횡령|법인카드.*개인.*사용|회사.*자금")),
    ("insubordination", re.compile(r"지시.*불이행|지시.*불복|명령.*위반|업무.*지시.*거부|불응|지시.*불응|지휘.*감독.*거부|상사.*명령")),
    ("misuse_authority", re.compile(r"직권.*남용|권한.*남용|지위.*이용|직권.*행사|채용.*비리|특혜|채용.*개입")),
    ("attendance_failure", re.compile(r"무단.*결근|무단.*조퇴|무단.*이탈|근무지.*이탈|근태.*불량|병가.*남용|장기.*결근|연차.*위반|복무.*위반")),
    ("dual_employment", re.compile(r"겸직|이중.*취업|영리.*행위|타사.*근무|개인.*사업|투잡|겸업|동종.*업무.*취업")),
    ("relationship_misconduct", re.compile(r"부적절.*관계|불륜|동료.*괴롭힘|혼외|이성.*관계|이성.*문제|사적.*만남")),
    ("public_servant_misconduct", re.compile(r"공무원.*품위|지방공무원법|국가공무원법|공무원.*비위|관용차|공직자")),
    ("safety_violation", re.compile(r"음주|안전수칙.*위반|보호구.*미착용|안전.*규정|음주.*운전|음주.*상태|혈중알코올|약물")),
    ("workplace_disturbance", re.compile(r"직장.*질서|품위.*손상|이미지.*실추|품위.*유지.*위반|동료.*폭언|직장.*분위기")),
    ("computer_misuse", re.compile(r"전산.*무단|회사.*컴퓨터.*개인|사내.*시스템.*무단|개인정보.*무단.*열람|업무용.*PC|이메일.*무단")),
    ("client_relationship", re.compile(r"고객.*폭언|고객.*불만|고객.*신뢰|민원.*야기|거래처.*문제|고객.*항의")),
]

def detect_subs(text):
    if not text:
        return []
    found = []
    for name, pat in SUB_PATTERNS:
        if pat.search(text):
            found.append(name)
    return found

def fetch_batch(env, offset, limit=500):
    qs = urllib.parse.urlencode({
        "select": "id,holding_points,key_issue,tags",
        "reason_category": "ov.{misconduct}",
        "limit": limit,
        "offset": offset,
    })
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/nlrc_decisions?{qs}"
    req = urllib.request.Request(url, headers={
        "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def update_row(env, row_id, subs):
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/nlrc_decisions?id=eq.{urllib.parse.quote(row_id)}"
    body = json.dumps({"sub_reason": subs}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        urllib.request.urlopen(req, timeout=30).read()
        return True
    except Exception as e:
        print(f"  err id={row_id}: {e}", flush=True)
        return False

def main():
    env = load_env()
    # 이미 sub_reason 부여된 row 스킵을 위해 NULL only로 페치하면 매번 0부터 시작해도 무한루프 없음.
    offset = 0
    total = 0
    tagged = 0
    counters = {}
    while True:
        rows = fetch_batch(env, offset, limit=500)
        if not rows:
            break
        # 1) Python 측에서 sub_reason 부여할 row만 추출
        updates = []
        for r in rows:
            text = " ".join(filter(None, [
                r.get("holding_points") or "",
                r.get("key_issue") or "",
                " ".join(r.get("tags") or []),
            ]))
            subs = detect_subs(text)
            if subs:
                updates.append((r["id"], subs))
                for s in subs:
                    counters[s] = counters.get(s, 0) + 1
        # 2) 병렬 PATCH (20 worker)
        if updates:
            with ThreadPoolExecutor(max_workers=20) as ex:
                futs = [ex.submit(update_row, env, rid, subs) for rid, subs in updates]
                for f in as_completed(futs):
                    if f.result():
                        tagged += 1
        total += len(rows)
        offset += 500
        print(f"processed {total} tagged {tagged}", flush=True)
    print("=== final ===")
    print(f"total={total} tagged={tagged}")
    for k, v in sorted(counters.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}")

if __name__ == "__main__":
    main()
