#!/usr/bin/env python3
"""
R3 베이스라인: 챗봇 30시나리오 평가
- /api/chat에 시나리오 query를 던져 SSE stream 수집
- 응답 텍스트 + tool 호출 추적해서 자동 채점
- URL 환각률, 인용률, 도구 호출률 측정

사용법:
    python scripts/run_r3_chat_eval.py --base-url https://www.노란봉투법.com [--out path]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / "eval" / "rubrics" / "r3-chat-scenarios.jsonl"
OUTPUT = ROOT / "eval" / "rubrics" / "r3-chat-baseline.json"

URL_WHITELIST = [
    r"https?://(www\.)?노란봉투법\.com",
    r"https?://(www\.)?xn--o80bk8isxeinax68f\.com",  # punycode
    r"https?://labor-decisions-search\.vercel\.app",
    r"https?://winhr\.co\.kr",
]
URL_RE = re.compile(r"https?://[^\s\)\]]+", re.IGNORECASE)
CITATION_RE = re.compile(r"\[(FAQ|CASE|COURT|INTERP)#(\d+)\]")


def is_whitelisted(url: str) -> bool:
    return any(re.match(p, url) for p in URL_WHITELIST)


CALC_NUMBER_RE = re.compile(r"(\d{1,3}(,\d{3})+|\d{4,})\s*원")
SANCTION_LINK_RE = re.compile(r"/sanction(\?|#|/|\b)")


def infer_tool_calls(text: str, citations: list[dict]) -> list[str]:
    """SSE에 도구 호출 메타가 없어 텍스트로부터 추정."""
    tools: list[str] = []
    if any(c["type"] == "FAQ" for c in citations):
        tools.append("search_faq")
    if any(c["type"] in ("CASE", "COURT") for c in citations):
        tools.append("search_cases")
    if any(c["type"] == "INTERP" for c in citations):
        tools.append("search_interpretation")
    if SANCTION_LINK_RE.search(text):
        tools.append("suggest_case_analyzer")
    if "/blog/" in text:
        tools.append("search_blog")
    # 계산기 — 큰 수치 + 단위가 등장하면 추정
    if CALC_NUMBER_RE.search(text):
        # 컨텍스트로 어떤 계산기인지 추정
        if "퇴직금" in text and "원" in text:
            tools.append("calc_severance")
        if "통상임금" in text:
            tools.append("calc_ordinary_wage")
        if "연장" in text and "수당" in text:
            tools.append("calc_overtime")
        if "최저임금" in text:
            tools.append("check_min_wage")
    if "근로기준법 제" in text and "조" in text:
        tools.append("lookup_law_article")
    return tools


def call_chat(base_url: str, query: str, timeout: int = 90) -> dict[str, Any]:
    """POST /api/chat with SSE — 응답 텍스트 수집 후 도구 호출 추정."""
    started = time.time()
    text_chunks = []

    payload = {
        "messages": [{"role": "user", "content": query}],
        "userSituation": None,
    }
    deadline = started + timeout
    try:
        with requests.post(
            f"{base_url}/api/chat",
            json=payload,
            stream=True,
            timeout=(10, 30),  # connect=10s, read=30s per chunk
            headers={"Accept": "text/event-stream", "Connection": "close"},
        ) as r:
            for line in r.iter_lines(decode_unicode=True, chunk_size=1024):
                if time.time() > deadline:
                    break
                if not line:
                    continue
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        ev = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    # 다양한 형식 — content 직접, delta.content, choices[0].delta.content
                    content = (
                        ev.get("content")
                        or (ev.get("delta") or {}).get("content")
                        or ((ev.get("choices") or [{}])[0].get("delta") or {}).get("content")
                    )
                    if content:
                        text_chunks.append(content)
    except requests.RequestException as e:
        return {
            "ok": False,
            "error": str(e),
            "elapsed": time.time() - started,
            "text": "",
            "urls": [],
            "tool_calls": [],
            "citations": [],
        }

    text = "".join(text_chunks)
    urls = URL_RE.findall(text)
    citations = [{"type": t, "id": i} for t, i in CITATION_RE.findall(text)]
    tool_calls = infer_tool_calls(text, citations)
    return {
        "ok": True,
        "elapsed": time.time() - started,
        "text": text,
        "text_len": len(text),
        "urls": urls,
        "tool_calls": tool_calls,
        "citations": citations,
    }


def score_scenario(scenario: dict, result: dict) -> dict:
    """checks 룰별 통과/실패 판정."""
    if not result.get("ok"):
        n_checks = len(scenario.get("checks", [])) or 1
        return {
            "passed": False,
            "passed_checks": [],
            "failed_checks": [f"API 실패: {result.get('error')}"],
            "n_pass": 0,
            "n_fail": n_checks,
        }

    checks = scenario.get("checks", [])
    text = result.get("text", "")
    urls = result.get("urls", [])
    tool_calls = result.get("tool_calls", [])
    citations = result.get("citations", [])

    fails = []
    passed = []

    for check in checks:
        if check == "no_external_url" or check == "no_external_url_outside_whitelist":
            bad = [u for u in urls if not is_whitelisted(u)]
            if bad:
                fails.append(f"{check}: 화이트리스트 외 URL {bad[:3]}")
            else:
                passed.append(check)
        elif check == "cite_faq":
            if any(c["type"] == "FAQ" for c in citations):
                passed.append(check)
            else:
                fails.append(f"{check}: FAQ 인용 없음")
        elif check == "cite_faq_or_case":
            if any(c["type"] in ("FAQ", "CASE", "COURT") for c in citations):
                passed.append(check)
            else:
                fails.append(f"{check}: FAQ/CASE/COURT 인용 없음")
        elif check == "cite_faq_or_law":
            if any(c["type"] in ("FAQ", "INTERP") for c in citations) or "근로기준법" in text or "노조법" in text:
                passed.append(check)
            else:
                fails.append(f"{check}: FAQ/INTERP/법 언급 없음")
        elif check == "cite_or_calc":
            if citations or any("calc" in t for t in tool_calls):
                passed.append(check)
            else:
                fails.append(f"{check}: 인용/계산 모두 없음")
        elif check.startswith("tool_"):
            tool_name = check[5:]  # tool_calc_severance → calc_severance
            if any(tool_name in t or t == tool_name for t in tool_calls):
                passed.append(check)
            else:
                fails.append(f"{check}: 도구 미호출 (호출됨: {tool_calls})")
        elif check == "tool_search_blog_or_no_link":
            if "search_blog" in tool_calls or not urls:
                passed.append(check)
            else:
                fails.append(f"{check}: 도구 미호출 + URL 등장")
        elif check in ("suggest_case_analyzer", "suggest_case_analyzer_or_link"):
            if "suggest_case_analyzer" in tool_calls or "/sanction" in text:
                passed.append(check)
            else:
                fails.append(f"{check}: 비교분석 안내 없음")
        elif check == "refuse_or_redirect":
            text_low = text.lower()
            if any(k in text for k in ["노동법 범위", "노무 상담", "전문가", "의료", "세무사", "병원", "의사", "범위 외", "다루기 어려"]):
                passed.append(check)
            else:
                fails.append(f"{check}: 거부/리다이렉트 신호 없음")
        elif check.startswith("mention_"):
            keyword_map = {
                "mention_30day_notice": ["30일", "해고예고"],
                "mention_probation_termination_rules": ["수습", "본채용", "통상해고"],
                "mention_renewal_expectation": ["갱신기대권", "갱신기대"],
                "mention_2026_amendment": ["2026", "개정", "시행"],
                "mention_specific_date": ["2026", "월", "일"],
                "mention_labor_office_or_civil": ["고용노동부", "노동청", "지방노동", "민사", "임금체불"],
                "mention_15hour_rule": ["15시간"],
                "mention_4_requirements": ["긴박한", "해고회피", "공정한", "협의"],
                "mention_pregnant_protection": ["임신", "출산", "보호", "야간근로", "연장근로"],
                "mention_3month_deadline_or_form": ["3개월", "구제신청"],
            }
            kws = keyword_map.get(check, [])
            if any(k in text for k in kws):
                passed.append(check)
            else:
                fails.append(f"{check}: 키워드 {kws} 없음")
        else:
            fails.append(f"{check}: 알 수 없는 룰")

    return {
        "passed": len(fails) == 0,
        "passed_checks": passed,
        "failed_checks": fails,
        "n_pass": len(passed),
        "n_fail": len(fails),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="https://www.노란봉투법.com")
    ap.add_argument("--out", default=str(OUTPUT))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--delay", type=float, default=2.0)
    args = ap.parse_args()

    if not INPUT.exists():
        sys.exit(f"입력 파일 없음: {INPUT}")
    scenarios = [json.loads(l) for l in INPUT.read_text().splitlines() if l.strip()]
    if args.limit:
        scenarios = scenarios[: args.limit]
    print(f"[R3] {len(scenarios)}개 시나리오 → {args.base_url}")

    results = []
    summary = {"total": 0, "passed": 0, "url_halluc": 0, "cite_rate_total_checks": 0, "cite_rate_pass": 0}
    for i, sc in enumerate(scenarios, 1):
        print(f"  [{i}/{len(scenarios)}] {sc['sid']} [{sc['category']}]: {sc['query'][:50]}...")
        r = call_chat(args.base_url, sc["query"])
        score = score_scenario(sc, r)
        bad_urls = [u for u in r.get("urls", []) if not is_whitelisted(u)]
        item = {
            "sid": sc["sid"],
            "category": sc["category"],
            "query": sc["query"],
            "elapsed": r.get("elapsed", 0),
            "text_len": r.get("text_len", 0),
            "urls": r.get("urls", []),
            "bad_urls": bad_urls,
            "tool_calls": r.get("tool_calls", []),
            "citations": r.get("citations", []),
            "score": score,
        }
        results.append(item)
        summary["total"] += 1
        if score["passed"]:
            summary["passed"] += 1
        if bad_urls:
            summary["url_halluc"] += 1
        print(f"      → {'PASS' if score['passed'] else 'FAIL'} (pass={score['n_pass']}/{score['n_pass']+score['n_fail']}) | tools={r.get('tool_calls')} | bad_urls={bad_urls[:1]}")
        time.sleep(args.delay)

    summary["pass_rate"] = round(summary["passed"] / max(summary["total"], 1) * 100, 1)
    summary["url_halluc_rate"] = round(summary["url_halluc"] / max(summary["total"], 1) * 100, 1)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(
        json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\n=== R3 베이스라인 ===")
    print(f"  통과: {summary['passed']}/{summary['total']} ({summary['pass_rate']}%)")
    print(f"  URL 환각: {summary['url_halluc']}/{summary['total']} ({summary['url_halluc_rate']}%)")
    print(f"  결과: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
