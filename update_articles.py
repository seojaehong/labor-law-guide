#!/usr/bin/env python3
"""
Two tasks for all blog_articles in Supabase:
1. Replace "노무사가 주목해야 할 포인트" and related ## headers with updated text
2. Add hyperlinks for cited laws and court case references
"""

import os
import re
import json
import urllib.request
import urllib.parse

SUPABASE_URL = os.environ["SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS_GET = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
}

HEADERS_PATCH = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def fetch_articles():
    url = f"{SUPABASE_URL}/rest/v1/blog_articles?select=slug,content"
    req = urllib.request.Request(url, headers=HEADERS_GET)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def patch_article(slug, content):
    url = f"{SUPABASE_URL}/rest/v1/blog_articles?slug=eq.{urllib.parse.quote(slug)}"
    body = json.dumps({"content": content}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=HEADERS_PATCH, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return resp.status


# ---------------------------------------------------------------------------
# Task 1: Replace 노무사 in headers
# ---------------------------------------------------------------------------

def task1_replace_nomusa_headers(content):
    """
    Rules:
    - "노무사가 주목해야 할 포인트" → "실무에서 주목할 포인트"  (anywhere in content, within headers)
    - "## 노무사 시사점" → "## 실무에서 주목할 포인트"
    - Other ## headers containing "노무사" → replace "노무사" with "실무자"
    - Do NOT touch body text uses of "노무사" (e.g., "노무사에게 자문을 구하세요")
    """
    original = content

    # 1. Replace "노무사가 주목해야 할 포인트" everywhere (could be in any heading level)
    content = re.sub(
        r'노무사가 주목해야 할 포인트',
        '실무에서 주목할 포인트',
        content
    )

    # 2. Replace "## 노무사 시사점" exactly
    content = re.sub(
        r'^(#{1,6}\s*)노무사 시사점\s*$',
        lambda m: m.group(1) + '실무에서 주목할 포인트',
        content,
        flags=re.MULTILINE
    )

    # 3. Any remaining ## headers that still contain "노무사" → replace with "실무자"
    def replace_nomusa_in_header(m):
        return m.group(0).replace('노무사', '실무자')

    content = re.sub(
        r'^#{1,6}[^\n]*노무사[^\n]*$',
        replace_nomusa_in_header,
        content,
        flags=re.MULTILINE
    )

    changed = content != original
    return content, changed


# ---------------------------------------------------------------------------
# Task 2: Add hyperlinks for laws and court cases
# ---------------------------------------------------------------------------

LAW_LINKS = {
    "근로기준법": "https://law.go.kr/법령/근로기준법",
    "노조법": "https://law.go.kr/법령/노동조합및노동관계조정법",
    "노동조합및노동관계조정법": "https://law.go.kr/법령/노동조합및노동관계조정법",
    "노동조합 및 노동관계조정법": "https://law.go.kr/법령/노동조합및노동관계조정법",
    "근로자퇴직급여보장법": "https://law.go.kr/법령/근로자퇴직급여보장법",
}

# Pattern: 법령명 제XX조 (optionally 제XX항 etc.)
# We want to linkify "근로기준법 제XX조" but not double-linkify already linked ones.

def make_law_article_link(law_name, article_text, base_url):
    """Return markdown link: [근로기준법 제X조](url)"""
    full_text = f"{law_name} {article_text}"
    return f"[{full_text}]({base_url})"


def task2_add_law_links(content):
    original = content

    # We need to avoid replacing inside already-existing markdown links: [...](...)
    # Strategy: split content into "inside link" vs "outside link" segments and only
    # process outside-link segments.

    # Regex to find already-linked spans: [text](url)
    link_pattern = re.compile(r'\[([^\]]*)\]\([^\)]*\)')

    # For each law, match: law_name + 제XX조 (with optional spaces, 항, 호, etc.)
    # Article reference pattern: 제\d+조(의\d+)?(제\d+항)?(제\d+호)?
    article_ref = r'제\d+조(?:의\d+)?(?:\s*제\d+항)?(?:\s*제\d+호)?'

    def linkify_laws(text):
        """Add links for law citations in a text segment that is NOT already linked."""
        for law_name, base_url in LAW_LINKS.items():
            # Pattern: law_name followed by article reference
            pattern = re.compile(
                r'(?<!\[)' +   # not preceded by [  (not already in link text)
                re.escape(law_name) +
                r'(\s*' + article_ref + r')'
            )
            def replacer(m, law=law_name, url=base_url):
                # Don't re-link if already inside a markdown link
                full = m.group(0)
                article = m.group(1)
                return f"[{law}{article}]({url})"
            text = pattern.sub(replacer, text)
        return text

    # Also handle standalone law names (without article reference) for 근로자퇴직급여보장법
    # which is often cited standalone
    def linkify_standalone_laws(text):
        standalone_laws = [
            ("근로자퇴직급여보장법", "https://law.go.kr/법령/근로자퇴직급여보장법"),
        ]
        for law_name, url in standalone_laws:
            # Only if not already followed by article ref and not already linked
            pattern = re.compile(
                r'(?<!\[)(?<!\/)' +
                re.escape(law_name) +
                r'(?!\s*제\d)(?!\])'
            )
            def replacer(m, law=law_name, u=url):
                return f"[{law}]({u})"
            text = pattern.sub(replacer, text)
        return text

    # Court case pattern: digits+다+digits (e.g., 2002다62432)
    # Also: 대법원 YYYY다NNNNN or just YYYY다NNNNN
    court_case_pattern = re.compile(
        r'(?<!\[)(?<!\()(\d{4}다\d+)(?!\])'
    )

    def linkify_court_cases(text):
        def replacer(m):
            case_id = m.group(1)
            return f"[대법원 {case_id}](https://glaw.scourt.go.kr/wsjo/panre/sjo100.do?contId={case_id})"
        return court_case_pattern.sub(replacer, text)

    # Bold 하급심 courts
    lower_court_pattern = re.compile(
        r'(?<!\*\*)(?<!\[)(서울행정법원|서울고등법원|부산고등법원|대구고등법원|광주고등법원|대전고등법원|수원고등법원|전주지방법원|인천지방법원|수원지방법원|의정부지방법원|춘천지방법원|청주지방법원|대전지방법원|대구지방법원|부산지방법원|울산지방법원|창원지방법원|광주지방법원|전주지방법원|제주지방법원)(?!\*\*)'
    )

    def bold_lower_courts(text):
        return lower_court_pattern.sub(r'**\1**', text)

    # Process content while skipping already-linked spans
    # We'll iterate through segments separated by existing links
    result_parts = []
    last_end = 0

    for m in link_pattern.finditer(content):
        # Process text before this link
        segment = content[last_end:m.start()]
        segment = linkify_laws(segment)
        segment = linkify_standalone_laws(segment)
        segment = linkify_court_cases(segment)
        segment = bold_lower_courts(segment)
        result_parts.append(segment)
        # Keep the existing link as-is
        result_parts.append(m.group(0))
        last_end = m.end()

    # Process remaining text after last link
    segment = content[last_end:]
    segment = linkify_laws(segment)
    segment = linkify_standalone_laws(segment)
    segment = linkify_court_cases(segment)
    segment = bold_lower_courts(segment)
    result_parts.append(segment)

    content = "".join(result_parts)

    changed = content != original
    return content, changed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Fetching all articles from Supabase...")
    articles = fetch_articles()
    print(f"Fetched {len(articles)} articles.")

    task1_modified = 0
    task2_modified = 0
    both_modified = 0
    errors = []

    for article in articles:
        slug = article["slug"]
        content = article.get("content") or ""

        if not content:
            print(f"  SKIP (no content): {slug}")
            continue

        # Task 1
        new_content_t1, changed_t1 = task1_replace_nomusa_headers(content)

        # Task 2 (operate on result of task1 so both changes are included)
        new_content_t2, changed_t2 = task2_add_law_links(new_content_t1)

        final_content = new_content_t2
        any_changed = changed_t1 or changed_t2

        if any_changed:
            try:
                status = patch_article(slug, final_content)
                flag_t1 = "[T1]" if changed_t1 else ""
                flag_t2 = "[T2]" if changed_t2 else ""
                print(f"  UPDATED {flag_t1}{flag_t2}: {slug}  (HTTP {status})")
                if changed_t1:
                    task1_modified += 1
                if changed_t2:
                    task2_modified += 1
                if changed_t1 and changed_t2:
                    both_modified += 1
            except Exception as e:
                print(f"  ERROR updating {slug}: {e}")
                errors.append((slug, str(e)))
        else:
            print(f"  no change: {slug}")

    print()
    print("=" * 60)
    print(f"Total articles:              {len(articles)}")
    print(f"Task1 (header replace) mods: {task1_modified}")
    print(f"Task2 (law links) mods:      {task2_modified}")
    print(f"Modified by both tasks:      {both_modified}")
    print(f"Errors:                      {len(errors)}")
    if errors:
        for slug, err in errors:
            print(f"  - {slug}: {err}")


if __name__ == "__main__":
    main()
