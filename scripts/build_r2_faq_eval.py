#!/usr/bin/env python3
"""
R2 베이스라인: FAQ 검색 정확도 평가셋 100문항 생성

전략:
1. canonical=true FAQ 1,000건 fetch
2. 31개 unified_category에서 비례 샘플링 100건
3. gpt-4o-mini로 사용자 변형 query 1개 생성 (자연스러운 사연 + 추가 잡음)
4. eval/rubrics/r2-faq-eval.jsonl 저장
5. 사용자 검수용 마크다운 생성

사용법:
    python scripts/build_r2_faq_eval.py --target 100 [--apply]
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "supabase" / ".env"
OUT_JSONL = ROOT / "eval" / "rubrics" / "r2-faq-eval.jsonl"
OUT_MD = ROOT / "eval" / "rubrics" / "r2-faq-eval-review.md"


def load_env() -> None:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def fetch_canonical_faqs(supabase_url: str, key: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        r = requests.get(
            f"{supabase_url}/rest/v1/faq",
            params={
                "select": "id,question,answer,unified_category,sub_topic",
                "is_canonical": "eq.true",
                "limit": 1000,
                "offset": offset,
            },
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=30,
        )
        chunk = r.json()
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


def sample_by_category(rows: list[dict], target: int) -> list[dict]:
    cats: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        cats[r.get("unified_category") or "기타"].append(r)
    total = sum(len(v) for v in cats.values())
    picked: list[dict] = []
    leftover = target
    cat_keys = sorted(cats.keys(), key=lambda k: -len(cats[k]))
    for cat in cat_keys:
        n = max(1, round(target * len(cats[cat]) / total))
        n = min(n, len(cats[cat]), leftover)
        if n <= 0:
            continue
        picked.extend(random.sample(cats[cat], n))
        leftover -= n
        if leftover <= 0:
            break
    return picked[:target]


def llm_paraphrase(question: str, openai_key: str) -> str:
    """gpt-4o-mini로 사용자 자연어 변형 생성. 실패 시 원본 반환."""
    prompt = (
        "다음 노동법 FAQ를 실제 사용자가 챗봇에 물어볼 법한 자연스러운 한국어 문장으로 1개만 변형해주세요. "
        "개인 상황 1~2개 추가, 정중한 어미, 50~120자.\n\n"
        f"원본: {question}\n\n변형 (한 문장만):"
    )
    try:
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 200,
                "temperature": 0.7,
            },
            timeout=30,
        )
        if r.status_code == 200:
            return r.json()["choices"][0]["message"]["content"].strip().strip('"\'')
    except Exception as e:
        print(f"  paraphrase fail: {e}")
    return question


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=100)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no-paraphrase", action="store_true")
    ap.add_argument("--apply", action="store_true", help="실제 LLM 호출 (없으면 dry sample만)")
    args = ap.parse_args()

    load_env()
    sb_url = os.environ.get("SUPABASE_URL") or "https://mewqgevgdgghhatqtuos.supabase.co"
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    if not sb_key:
        sys.exit("SUPABASE_SERVICE_KEY 필요")

    random.seed(args.seed)
    print(f"[R2] canonical FAQ fetch...")
    rows = fetch_canonical_faqs(sb_url, sb_key)
    print(f"  total canonical: {len(rows)}")

    sampled = sample_by_category(rows, args.target)
    cats = Counter(r.get("unified_category") for r in sampled)
    print(f"  sampled: {len(sampled)} | 카테고리별: {dict(cats.most_common(10))}...")

    if not args.apply:
        print(f"  (dry — --apply 없음. 샘플만 보여주고 종료)")
        for r in sampled[:5]:
            print(f"    [{r['unified_category']}] {r['id']}: {r['question'][:60]}")
        return 0

    if not args.no_paraphrase and not openai_key:
        sys.exit("OPENAI_API_KEY 필요 (또는 --no-paraphrase)")

    OUT_JSONL.parent.mkdir(parents=True, exist_ok=True)
    items = []
    for i, r in enumerate(sampled, 1):
        if not args.no_paraphrase:
            user_q = llm_paraphrase(r["question"], openai_key)
            time.sleep(0.3)
        else:
            user_q = r["question"]
        item = {
            "qid": f"R2-{i:03d}",
            "user_query": user_q,
            "expected_faq_id": r["id"],
            "expected_category": r["unified_category"],
            "original_question": r["question"],
            "answer_first_120": (r.get("answer") or "")[:120],
        }
        items.append(item)
        if i % 10 == 0:
            print(f"  [{i}/{len(sampled)}] {user_q[:60]}")

    with OUT_JSONL.open("w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    # 사용자 검수용 마크다운
    md_lines = ["# R2 FAQ 평가셋 (사용자 검수용)\n"]
    md_lines.append(f"**총 {len(items)}문항** | 카테고리: {dict(cats.most_common(10))}\n")
    md_lines.append("\n---\n")
    md_lines.append("\n각 문항이 적절한지 검토 후 부적절한 것은 본 파일에 ❌ 표시하거나 코멘트 남겨주세요.\n\n")
    for it in items:
        md_lines.append(f"### {it['qid']} [{it['expected_category']}]\n")
        md_lines.append(f"- **유저 질문**: {it['user_query']}\n")
        md_lines.append(f"- **기대 정답 FAQ#{it['expected_faq_id']}**: {it['original_question']}\n")
        md_lines.append(f"- **답변 도입 120자**: {it['answer_first_120']}...\n\n")
    OUT_MD.write_text("".join(md_lines), encoding="utf-8")

    print(f"\n=== 완료 ===")
    print(f"  JSONL: {OUT_JSONL}")
    print(f"  검수: {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
