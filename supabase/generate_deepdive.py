"""
오늘의 뉴스 → GPT 딥다이브 기사 생성 → blog_articles 테이블 적재
작업 스케줄러로 daily_news_update.py 이후 실행

실행: python supabase/generate_deepdive.py
환경변수: SUPABASE_SERVICE_KEY, OPENAI_API_KEY
"""
import json, os, sys, time, re, unicodedata
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

from supabase import create_client

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

KEYWORD_TAGS = [
    '노란봉투법', '노조법', '손해배상', '가압류', '단체교섭',
    '부당노동행위', '노동위원회', '쟁의행위', '파업', '원청', '하청',
    '교섭', '파견', '도급', '사용자성', '노동조합',
    '임금체불', '해고', '복직', '근로계약', '최저임금',
    '산업재해', '중대재해', '직장갑질', '성희롱', '차별',
]

TOP_N = 3  # 생성할 기사 수


def score_news(news_item):
    """키워드 밀도 기반 뉴스 중요도 점수 계산"""
    text = f"{news_item.get('title', '')} {news_item.get('summary', '')}"
    matched = [kw for kw in KEYWORD_TAGS if kw in text]
    score = len(matched) * 2

    # 요약이 있으면 가산점
    if news_item.get('summary'):
        score += 1

    # 키워드 빈도 가산점
    for kw in KEYWORD_TAGS:
        score += text.count(kw)

    return score


def fetch_recent_news(hours=24):
    """최근 N시간 이내의 뉴스 조회"""
    KST = timezone(timedelta(hours=9))
    now_kst = datetime.now(KST)
    cutoff_utc = (now_kst - timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%S+00:00')

    result = sb.table('news') \
        .select('id,title,summary,source,published_at,keywords_matched') \
        .gte('published_at', cutoff_utc) \
        .order('published_at', desc=True) \
        .execute()

    return result.data or []


def select_top_news(news_list, top_n=TOP_N):
    """키워드 밀도 기반으로 상위 N개 뉴스 선택"""
    scored = [(score_news(n), n) for n in news_list]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [n for _, n in scored[:top_n]]


def make_slug(date_str, index):
    """날짜 기반 URL 안전 슬러그 생성 (YYYYMMDD-N 형식)"""
    return f"{date_str}-{index}"


def generate_deepdive_article(news_item):
    """GPT-4o-mini로 딥다이브 기사 생성"""
    title = news_item.get('title', '')
    summary = news_item.get('summary', '') or title
    source = news_item.get('source', '언론사 미상')

    prompt = f"""당신은 노무법인 위너스의 노동법 전문 에디터입니다.
다음 뉴스를 기반으로 노무사/인사담당자를 위한 딥다이브 분석 기사를 작성하세요.

뉴스 제목: {title}
뉴스 요약: {summary}
출처: {source}

작성 규칙:
1. 1500~2500자 서술형
2. 도입부: 뉴스 핵심을 흥미롭게 시작 (딥다이브 뉴스레터 스타일)
3. 본론: 배경, 맥락, 관련 법령/판례 분석
4. 실무 시사점: 노무사/인사담당자가 알아야 할 액션 아이템
5. 마무리: 전망 또는 핵심 메시지
6. 제목은 🎯 이모지로 시작, 호기심을 유발하는 형식
7. 부제목도 작성

JSON 형식으로 응답:
{{
  "title": "🎯...",
  "subtitle": "...",
  "content": "...(마크다운 형식)",
  "category": "종합|노동법|판례분석|뉴스해설|실무가이드 중 택1",
  "tags": ["키워드1", "키워드2", ...],
  "seo_title": "...(60자 이내)",
  "seo_description": "...(155자 이내)"
}}"""

    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "당신은 노동법 전문 에디터입니다. 반드시 유효한 JSON만 응답하세요."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 2500,
        "temperature": 0.7,
        "response_format": {"type": "json_object"},
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {OPENAI_KEY}',
        }
    )

    resp = urllib.request.urlopen(req, timeout=60)
    data = json.loads(resp.read().decode('utf-8'))
    raw = data['choices'][0]['message']['content'].strip()
    return json.loads(raw)


def check_slug_exists(slug):
    """슬러그 중복 확인"""
    result = sb.table('blog_articles').select('slug').eq('slug', slug).execute()
    return bool(result.data)


def insert_article(slug, article_data, news_id, published_at):
    """blog_articles 테이블에 기사 삽입"""
    content = article_data.get('content', '')
    summary = content[:200].replace('\n', ' ').strip() if content else ''

    row = {
        'slug': slug,
        'title': article_data.get('title', ''),
        'subtitle': article_data.get('subtitle', ''),
        'content': content,
        'summary': summary,
        'category': article_data.get('category', '종합'),
        'tags': article_data.get('tags', []),
        'author': '위너스 에디터',
        'published_at': published_at,
        'seo_title': article_data.get('seo_title', '')[:60] if article_data.get('seo_title') else '',
        'seo_description': article_data.get('seo_description', '')[:155] if article_data.get('seo_description') else '',
        'source_news_id': news_id,
    }

    sb.table('blog_articles').insert(row).execute()
    return row


def main():
    KST = timezone(timedelta(hours=9))
    now_kst = datetime.now(KST)
    today_str = now_kst.strftime('%Y%m%d')

    print(f'📝 [{now_kst.strftime("%Y-%m-%d %H:%M")}] 딥다이브 기사 생성 시작...')

    if not OPENAI_KEY:
        print('  오류: OPENAI_API_KEY 환경변수가 설정되지 않았습니다.')
        sys.exit(1)

    if not SUPABASE_KEY:
        print('  오류: SUPABASE_SERVICE_KEY 환경변수가 설정되지 않았습니다.')
        sys.exit(1)

    # 1. 최근 24시간 뉴스 조회
    news_list = fetch_recent_news(hours=24)
    print(f'  최근 24시간 뉴스: {len(news_list)}건')

    if not news_list:
        # 48시간으로 확대
        news_list = fetch_recent_news(hours=48)
        print(f'  최근 48시간으로 확대: {len(news_list)}건')

    if not news_list:
        print('  처리할 뉴스 없음. 종료.')
        return

    # 2. 상위 N개 선택
    top_news = select_top_news(news_list, top_n=TOP_N)
    print(f'  딥다이브 대상 선택: {len(top_news)}건')
    for i, n in enumerate(top_news, 1):
        print(f'    {i}. [{n["source"]}] {n["title"][:50]}')

    # 3. 기사 생성 및 적재
    success_count = 0
    article_index = 1

    for news_item in top_news:
        slug = make_slug(today_str, article_index)

        # 슬러그 중복 확인
        if check_slug_exists(slug):
            print(f'  ⚠ 슬러그 중복, 건너뜀: {slug}')
            article_index += 1
            continue

        print(f'  생성 중 [{article_index}/{len(top_news)}]: {news_item["title"][:40]}...')

        try:
            article_data = generate_deepdive_article(news_item)
        except Exception as e:
            print(f'  ⚠ GPT 생성 실패: {e}')
            article_index += 1
            time.sleep(2)
            continue

        try:
            published_at = now_kst.isoformat()
            row = insert_article(slug, article_data, news_item.get('id'), published_at)
            print(f'  ✅ 적재 완료: {slug} | {article_data.get("title", "")[:40]}')
            success_count += 1
        except Exception as e:
            print(f'  ⚠ DB 적재 실패: {e}')

        article_index += 1
        time.sleep(2)  # API 레이트 리밋 방지

    print(f'\n📝 딥다이브 생성 완료: {success_count}/{len(top_news)}건 성공')


if __name__ == '__main__':
    main()
