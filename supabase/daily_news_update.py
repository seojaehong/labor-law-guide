"""
매일 뉴스 자동 수집 → Google RSS → URL 변환 → GPT 요약 → Supabase 적재
작업 스케줄러로 매일 09:00 실행

실행: python supabase/daily_news_update.py
환경변수: SUPABASE_SERVICE_KEY, OPENAI_API_KEY
"""
import html as html_mod
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

KEYWORD_TAGS = [
    '노란봉투법', '노조법', '손해배상', '가압류', '단체교섭',
    '부당노동행위', '노동위원회', '쟁의행위', '파업', '원청', '하청',
    '교섭', '파견', '도급', '사용자성', '노동조합',
]

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


def normalize_title(title):
    """제목 정규화: 소스 접미사 제거 + 특수문자/공백 정리 → 동일 기사 판별용"""
    t = re.sub(r'\s*-\s*[^\-]+$', '', title)  # "제목 - 네이트" → "제목"
    t = re.sub(r'[…·\s]+', '', t)  # 말줄임표, 가운뎃점, 공백 모두 제거
    return t


def extract_keywords(title, summary):
    text = f"{title} {summary}"
    return [kw for kw in KEYWORD_TAGS if kw in text]


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
            title = html_mod.unescape((node.findtext("title") or "")).strip()
            link = (node.findtext("link") or "").strip()
            pub_date_raw = (node.findtext("pubDate") or "").strip()
            source_elem = node.find("source")
            source_name = (source_elem.text or "").strip() if source_elem is not None else ""

            if not link or link in seen:
                continue
            seen.add(link)

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
    """GPT로 기사 요약 생성"""
    if not article_text:
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

    # 2. 기존 뉴스 ID + 제목 조회 (중복 방지)
    existing = set()
    existing_titles = set()
    offset = 0
    while True:
        result = sb.table('news').select('id,title').range(offset, offset + 999).execute()
        if not result.data:
            break
        for r in result.data:
            existing.add(r['id'])
            existing_titles.add(normalize_title(r.get('title', '')))
        offset += 1000
        if len(result.data) < 1000:
            break
    print(f'  기존 뉴스: {len(existing)}건')

    # 3. 새 뉴스만 처리 (URL 디코딩 + 크롤링 + GPT 요약)
    new_rows = []
    seen_titles = set()
    for item in raw_news:
        google_link = item['google_link']
        nid = f"news_{hashlib.md5(google_link.encode()).hexdigest()[:16]}"

        if nid in existing:
            continue

        # 제목 중복 체크 (소스만 다른 동일 기사 필터링)
        norm_title = normalize_title(item['title'])
        if norm_title in existing_titles or norm_title in seen_titles:
            continue
        seen_titles.add(norm_title)

        real_url = decode_google_url(google_link)

        summary = ''
        article_text = fetch_article_text(real_url)
        try:
            if article_text:
                summary = generate_summary(item['title'], article_text)
            else:
                summary = generate_summary(item['title'], item['title'])
        except Exception as e:
            print(f'  ⚠ 요약 실패: {item["title"][:30]} ({e})')

        new_rows.append({
            'id': nid,
            'title': item['title'],
            'source': item['source'],
            'published_at': item['published_at'],
            'url': real_url,
            'summary': summary[:1000],
            'keywords_matched': extract_keywords(item['title'], summary),
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

    # 5. 오늘의 브리핑 생성
    generate_daily_briefing()

    print(f'📰 [{datetime.now().strftime("%H:%M")}] 완료!')


def generate_daily_briefing():
    """오늘 수집된 뉴스를 종합하여 브리핑 생성 → news_briefings 테이블 저장"""
    from datetime import timedelta, timezone

    KST = timezone(timedelta(hours=9))
    now_kst = datetime.now(KST)
    today = now_kst.strftime('%Y-%m-%d')

    kst_start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
    utc_start = (kst_start - timedelta(hours=9)).strftime('%Y-%m-%dT%H:%M:%S+00:00')

    result = sb.table('news').select('title,summary,source,keywords_matched') \
        .gte('published_at', utc_start) \
        .order('published_at', desc=True) \
        .execute()

    if not result.data or len(result.data) == 0:
        utc_24h = (now_kst - timedelta(hours=33)).strftime('%Y-%m-%dT%H:%M:%S+00:00')
        result = sb.table('news').select('title,summary,source,keywords_matched') \
            .gte('published_at', utc_24h) \
            .order('published_at', desc=True) \
            .execute()

    if not result.data or len(result.data) == 0:
        print('  브리핑: 최근 뉴스 없음, 건너뜀.')
        return

    news_list = result.data
    news_count = len(news_list)

    from collections import Counter
    kw_counter = Counter()
    for n in news_list:
        for kw in (n.get('keywords_matched') or []):
            kw_counter[kw] += 1
    top_keywords = [kw for kw, _ in kw_counter.most_common(5)]

    news_text = '\n'.join(
        f"- [{n['source']}] {n['title']}: {(n.get('summary') or '')[:200]}"
        for n in news_list[:20]
    )

    prompt = f"""당신은 노동법 전문 뉴스 에디터입니다. 아래 오늘({today}) 수집된 뉴스 {news_count}건을 종합하여 브리핑을 작성하세요.

## 작성 규칙
- 마크다운 형식 (프론트엔드에서 렌더링)
- **핵심 동향** (2~3문장): 오늘 전체 흐름을 한눈에
- **주요 이슈** (3~5개 bullet): 각 이슈별 1~2줄 요약
- **원청·사용자 관점 시사점** (2~3 bullet): 기업이 주목할 포인트
- 간결하고 전문적인 톤, 총 400자 내외

## 오늘의 뉴스
{news_text}

브리핑:"""

    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 600,
        "temperature": 0.3,
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {OPENAI_KEY}',
        }
    )

    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode('utf-8'))
        content = data['choices'][0]['message']['content'].strip()
    except Exception as e:
        print(f'  ⚠ 브리핑 생성 실패: {e}')
        return

    sb.table('news_briefings').upsert({
        'date': today,
        'title': f'{today} 노동 브리핑',
        'content': content,
        'news_count': news_count,
        'top_keywords': top_keywords,
    }).execute()

    print(f'  📋 브리핑 생성 완료 ({news_count}건 종합)')


if __name__ == '__main__':
    main()
