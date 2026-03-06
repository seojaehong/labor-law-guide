"""
매일 뉴스 자동 수집 → URL 변환 → 요약 → Supabase 적재
작업 스케줄러로 매일 09:00 실행

실행: python supabase/daily_news_update.py
환경변수: SUPABASE_SERVICE_KEY, OPENAI_API_KEY
"""
import json, os, sys, time, hashlib, re, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from supabase import create_client
from googlenewsdecoder import new_decoderv1

sys.stdout.reconfigure(encoding='utf-8')

# .env 파일 로드 (python-dotenv 없이)
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

SUPABASE_URL = 'https://mewqgevgdgghhatqtuos.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
OPENAI_KEY = os.environ.get('OPENAI_API_KEY', '')

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

GOOGLE_RSS_BASE = "https://news.google.com/rss/search"

NEWS_QUERIES = [
    "노란봉투법",
    "노조법 2조 3조",
    "노조 손해배상 가압류",
    "단체교섭 노사관계",
    "부당노동행위 판결",
    "노동위원회 중앙노동위원회",
    "쟁의행위 파업 판례",
    "원청 하청 노사관계",
]


def fetch_google_news(days=2):
    """Google News RSS에서 최근 뉴스 수집"""
    items = []
    seen = set()

    for query in NEWS_QUERIES:
        q = f"{query} when:{days}d"
        url = f"{GOOGLE_RSS_BASE}?q={urllib.parse.quote(q)}&hl=ko&gl=KR&ceid=KR:ko"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                xml_bytes = resp.read()
        except Exception:
            continue

        try:
            root = ET.fromstring(xml_bytes)
        except Exception:
            continue

        for node in root.findall(".//item"):
            title = (node.findtext("title") or "").strip()
            link = (node.findtext("link") or "").strip()
            pub_date_raw = (node.findtext("pubDate") or "").strip()
            source_elem = node.find("source")
            source_name = (source_elem.text or "").strip() if source_elem is not None else ""

            if not link or link in seen:
                continue
            seen.add(link)

            # 날짜 파싱
            pub_date = None
            if pub_date_raw:
                try:
                    pub_date = parsedate_to_datetime(pub_date_raw).isoformat()
                except Exception:
                    pub_date = pub_date_raw

            items.append({
                "title": title,
                "google_link": link,
                "published_at": pub_date,
                "source": source_name,
            })

    return items


def decode_google_url(google_url):
    """Google News URL → 실제 기사 URL"""
    try:
        result = new_decoderv1(google_url)
        if result.get('status'):
            return result['decoded_url']
    except Exception:
        pass
    return google_url


def fetch_article_text(url):
    """기사 본문 추출"""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        resp = urllib.request.urlopen(req, timeout=10)
        html = resp.read().decode('utf-8', errors='ignore')
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:3000]
    except Exception:
        return ''


def generate_summary(title, article_text):
    """기사 요약 생성"""
    if not article_text or len(article_text) < 50:
        return ''

    prompt = f"""다음 뉴스 기사를 2~3문장으로 핵심만 요약하세요.

제목: {title}
본문:
{article_text[:2000]}

요약:"""

    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 200,
        "temperature": 0.2,
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {OPENAI_KEY}',
        }
    )
    resp = urllib.request.urlopen(req, timeout=30)
    data = json.loads(resp.read().decode('utf-8'))
    return data['choices'][0]['message']['content'].strip()


def main():
    print(f'📰 [{datetime.now().strftime("%Y-%m-%d %H:%M")}] 뉴스 자동 수집 시작...')

    # 1. Google News RSS 수집
    raw_news = fetch_google_news(days=2)
    print(f'  RSS 수집: {len(raw_news)}건')

    if not raw_news:
        print('  수집된 뉴스 없음. 종료.')
        return

    # 2. 기존 뉴스 ID 조회 (중복 방지)
    existing = set()
    offset = 0
    while True:
        result = sb.table('news').select('id').range(offset, offset + 999).execute()
        if not result.data:
            break
        for r in result.data:
            existing.add(r['id'])
        offset += 1000
        if len(result.data) < 1000:
            break
    print(f'  기존 뉴스: {len(existing)}건')

    # 3. 새 뉴스만 처리
    new_rows = []
    for i, item in enumerate(raw_news):
        google_link = item['google_link']
        nid = f"news_{hashlib.md5(google_link.encode()).hexdigest()[:16]}"

        if nid in existing:
            continue

        # URL 디코딩
        real_url = decode_google_url(google_link)

        # 기사 크롤링 + 요약
        summary = ''
        article_text = fetch_article_text(real_url)
        if article_text:
            try:
                summary = generate_summary(item['title'], article_text)
            except Exception as e:
                print(f'  ⚠ 요약 실패: {item["title"][:30]} ({e})')

        new_rows.append({
            'id': nid,
            'title': item['title'],
            'source': item['source'],
            'published_at': item['published_at'],
            'url': real_url,
            'summary': summary[:1000],
            'keywords_matched': [],
        })

        time.sleep(0.3)

    print(f'  신규 뉴스: {len(new_rows)}건')

    # 4. Supabase 적재
    if new_rows:
        batch_size = 100
        for i in range(0, len(new_rows), batch_size):
            batch = new_rows[i:i+batch_size]
            sb.table('news').upsert(batch).execute()
        print(f'  ✅ Supabase 적재: {len(new_rows)}건')
    else:
        print('  신규 뉴스 없음.')

    print(f'📰 [{datetime.now().strftime("%H:%M")}] 완료!')


if __name__ == '__main__':
    main()
