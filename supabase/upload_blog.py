#!/usr/bin/env python3
"""블로그 글 Supabase 업로드 스크립트"""
import os, json, sys, re, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))

def get_env():
    from pathlib import Path
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        for line in env_path.read_text().split('\n'):
            if '=' in line and not line.startswith('#'):
                k, v = line.strip().split('=', 1)
                os.environ.setdefault(k, v)
    return os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY']

def generate_slug():
    now = datetime.now(KST)
    date_str = now.strftime('%Y%m%d')
    url, key = get_env()
    req = urllib.request.Request(
        f"{url}/rest/v1/blog_articles?slug=like.{date_str}-*&select=slug&order=slug.desc&limit=1",
        headers={'apikey': key, 'Authorization': f'Bearer {key}'}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    if data:
        last_n = int(data[0]['slug'].split('-')[-1])
        return f"{date_str}-{last_n + 1}"
    return f"{date_str}-1"

def upload(title, content, category, author, tags, seo_title=None, seo_description=None, subtitle=None):
    url, key = get_env()
    slug = generate_slug()
    summary = re.sub(r'[#*\[\]>]', '', content[:300]).strip()[:200]

    body = {
        "slug": slug,
        "title": title,
        "subtitle": subtitle or "",
        "content": content,
        "summary": summary,
        "category": category,
        "author": author,
        "tags": tags,
        "seo_title": seo_title or title[:60],
        "seo_description": seo_description or summary[:155],
        "published_at": datetime.now(KST).isoformat(),
    }

    data = json.dumps(body, ensure_ascii=False).encode()
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    req = urllib.request.Request(f"{url}/rest/v1/blog_articles", data=data, headers=headers)
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())

    print(f"✅ 업로드 완료: {slug} | {title}")
    return result

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python upload_blog.py <json_file>")
        sys.exit(1)
    with open(sys.argv[1], encoding='utf-8') as f:
        article = json.load(f)
    upload(**article)
