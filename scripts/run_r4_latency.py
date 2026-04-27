#!/usr/bin/env python3
"""
R4 베이스라인: API 레이턴시 측정 (p50/p95)

대상 엔드포인트:
- /api/chat (POST, SSE) — TTFB + total
- /api/faq?q= (GET)
- /api/cases?q= (GET)
- /api/search?q= (labor-decisions-search 도메인)

사용법:
    python scripts/run_r4_latency.py --rounds 20
"""
from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "eval" / "rubrics" / "r4-latency-baseline.json"

QUERIES = ["퇴직금", "부당해고", "직장내괴롭힘", "노란봉투법", "임금체불"]


def measure_get(url: str) -> tuple[float, int]:
    t0 = time.time()
    try:
        r = requests.get(url, timeout=30)
        return time.time() - t0, r.status_code
    except requests.RequestException:
        return time.time() - t0, 0


def measure_chat_ttfb(base_url: str, query: str) -> tuple[float, float, int]:
    """SSE 첫 청크까지 시간(TTFB) + 전체 시간. timeout 60초."""
    t0 = time.time()
    ttfb = None
    deadline = t0 + 60
    try:
        with requests.post(
            f"{base_url}/api/chat",
            json={"messages": [{"role": "user", "content": query}]},
            stream=True,
            timeout=(10, 30),
            headers={"Connection": "close"},
        ) as r:
            for line in r.iter_lines(decode_unicode=True, chunk_size=1024):
                if time.time() > deadline:
                    break
                if line and line.startswith("data: ") and ttfb is None:
                    ttfb = time.time() - t0
                if line == "data: [DONE]":
                    break
            return ttfb or 0, time.time() - t0, r.status_code
    except requests.RequestException:
        return 0, time.time() - t0, 0


def percentile(values: list[float], p: int) -> float:
    if not values:
        return 0.0
    return statistics.quantiles(values, n=100)[p - 1] if len(values) > 1 else values[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", type=int, default=10)
    ap.add_argument("--law-base", default="https://www.노란봉투법.com")
    ap.add_argument("--dec-base", default="https://labor-decisions-search.vercel.app")
    args = ap.parse_args()

    results: dict[str, dict] = {}

    print(f"[R4] {args.rounds}라운드 × 5쿼리 / 4엔드포인트")

    # /api/faq
    times_faq = []
    for q in QUERIES * args.rounds:
        t, code = measure_get(f"{args.law_base}/api/faq?q={q}&limit=5")
        if code == 200:
            times_faq.append(t)
    results["faq"] = {
        "n": len(times_faq),
        "p50": round(statistics.median(times_faq), 3) if times_faq else None,
        "p95": round(percentile(times_faq, 95), 3) if times_faq else None,
        "mean": round(statistics.mean(times_faq), 3) if times_faq else None,
    }
    print(f"  /api/faq: n={len(times_faq)} p50={results['faq']['p50']}s p95={results['faq']['p95']}s")

    # /api/cases
    times_cases = []
    for q in QUERIES * args.rounds:
        t, code = measure_get(f"{args.law_base}/api/cases?q={q}&limit=5")
        if code == 200:
            times_cases.append(t)
    results["cases"] = {
        "n": len(times_cases),
        "p50": round(statistics.median(times_cases), 3) if times_cases else None,
        "p95": round(percentile(times_cases, 95), 3) if times_cases else None,
        "mean": round(statistics.mean(times_cases), 3) if times_cases else None,
    }
    print(f"  /api/cases: n={len(times_cases)} p50={results['cases']['p50']}s p95={results['cases']['p95']}s")

    # /api/search (labor-decisions-search)
    times_search = []
    for q in QUERIES * args.rounds:
        t, code = measure_get(f"{args.dec_base}/api/search?q={q}&top_k=5")
        if code == 200:
            times_search.append(t)
    results["search_decisions"] = {
        "n": len(times_search),
        "p50": round(statistics.median(times_search), 3) if times_search else None,
        "p95": round(percentile(times_search, 95), 3) if times_search else None,
        "mean": round(statistics.mean(times_search), 3) if times_search else None,
    }
    print(f"  /api/search: n={len(times_search)} p50={results['search_decisions']['p50']}s p95={results['search_decisions']['p95']}s")

    # /api/chat (TTFB + total) — 비싸서 라운드 절반
    chat_ttfb = []
    chat_total = []
    chat_rounds = max(1, args.rounds // 2)
    for q in QUERIES * chat_rounds:
        ttfb, total, code = measure_chat_ttfb(args.law_base, q)
        if code == 200:
            chat_ttfb.append(ttfb)
            chat_total.append(total)
    results["chat_ttfb"] = {
        "n": len(chat_ttfb),
        "p50": round(statistics.median(chat_ttfb), 3) if chat_ttfb else None,
        "p95": round(percentile(chat_ttfb, 95), 3) if chat_ttfb else None,
    }
    results["chat_total"] = {
        "n": len(chat_total),
        "p50": round(statistics.median(chat_total), 3) if chat_total else None,
        "p95": round(percentile(chat_total, 95), 3) if chat_total else None,
    }
    print(f"  /api/chat TTFB: p50={results['chat_ttfb']['p50']}s p95={results['chat_ttfb']['p95']}s")
    print(f"  /api/chat total: p50={results['chat_total']['p50']}s p95={results['chat_total']['p95']}s")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {"baseline_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "rounds": args.rounds, "endpoints": results},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n  저장: {OUTPUT}")


if __name__ == "__main__":
    main()
