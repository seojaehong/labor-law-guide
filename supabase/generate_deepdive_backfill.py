"""
과거 7일치 뉴스 → GPT 딥다이브 기사 생성 → blog_articles 테이블 적재
초기 콘텐츠 확보용 1회성 스크립트 (일별 2건 × 7일 = 최대 14건)

실행: python supabase/generate_deepdive_backfill.py
환경변수: SUPABASE_SERVICE_KEY, OPENAI_API_KEY
"""
import json, os, sys, time, re
import urllib.request
from collections import defaultdict
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

ARTICLES_PER_DAY = 2  # 일별 생성 기사 수
BACKFILL_DAYS = 7     # 소급 기간 (일)


def score_news(news_item):
    """키워드 밀도 기반 뉴스 중요도 점수 계산"""
    text = f"{news_item.get('title', '')} {news_item.get('summary', '')}"
    matched = [kw for kw in KEYWORD_TAGS if kw in text]
    score = len(matched) * 2

    if news_item.get('summary'):
        score += 1

    for kw in KEYWORD_TAGS:
        score += text.count(kw)

    return score


def fetch_news_by_date_range(start_utc, end_utc):
    """특정 날짜 범위의 뉴스 조회"""
    result = sb.table('news') \
        .select('id,title,summary,source,published_at,keywords_matched') \
        .gte('published_at', start_utc) \
        .lt('published_at', end_utc) \
        .order('published_at', desc=True) \
        .execute()

    return result.data or []


def select_top_news_for_day(news_list, top_n=ARTICLES_PER_DAY):
    """하루치 뉴스에서 상위 N개 선택"""
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

    print(f'📚 [{now_kst.strftime("%Y-%m-%d %H:%M")}] 딥다이브 백필 시작 (최근 {BACKFILL_DAYS}일, 일별 {ARTICLES_PER_DAY}건)...')

    if not OPENAI_KEY:
        print('  오류: OPENAI_API_KEY 환경변수가 설정되지 않았습니다.')
        sys.exit(1)

    if not SUPABASE_KEY:
        print('  오류: SUPABASE_SERVICE_KEY 환경변수가 설정되지 않았습니다.')
        sys.exit(1)

    total_success = 0
    total_attempted = 0

    # 최신 날짜부터 역순으로 처리
    for day_offset in range(BACKFILL_DAYS):
        # KST 기준 해당 날짜의 시작/끝 계산
        target_kst = now_kst - timedelta(days=day_offset)
        day_kst_start = target_kst.replace(hour=0, minute=0, second=0, microsecond=0)
        day_kst_end = day_kst_start + timedelta(days=1)

        # UTC 변환
        day_utc_start = (day_kst_start - timedelta(hours=9)).strftime('%Y-%m-%dT%H:%M:%S+00:00')
        day_utc_end = (day_kst_end - timedelta(hours=9)).strftime('%Y-%m-%dT%H:%M:%S+00:00')

        date_str = day_kst_start.strftime('%Y%m%d')
        date_display = day_kst_start.strftime('%Y-%m-%d')

        print(f'\n  [{date_display}] 뉴스 조회 중...')

        news_list = fetch_news_by_date_range(day_utc_start, day_utc_end)
        print(f'    뉴스 {len(news_list)}건 조회')

        if not news_list:
            print(f'    뉴스 없음, 건너뜀.')
            continue

        # 상위 N개 선택
        top_news = select_top_news_for_day(news_list, top_n=ARTICLES_PER_DAY)
        print(f'    딥다이브 대상: {len(top_news)}건')

        article_index = 1

        for news_item in top_news:
            slug = make_slug(date_str, article_index)
            total_attempted += 1

            # 슬러그 중복 확인
            if check_slug_exists(slug):
                print(f'    ⚠ 슬러그 이미 존재, 건너뜀: {slug}')
                article_index += 1
                continue

            print(f'    생성 중: {slug} | {news_item["title"][:45]}...')

            try:
                article_data = generate_deepdive_article(news_item)
            except Exception as e:
                print(f'    ⚠ GPT 생성 실패: {e}')
                article_index += 1
                time.sleep(2)
                continue

            try:
                # 해당 날짜 정오(KST)로 published_at 설정
                published_at = day_kst_start.replace(hour=12).isoformat()
                insert_article(slug, article_data, news_item.get('id'), published_at)
                print(f'    ✅ 적재: {slug} | {article_data.get("title", "")[:40]}')
                total_success += 1
            except Exception as e:
                print(f'    ⚠ DB 적재 실패: {e}')

            article_index += 1
            time.sleep(2)  # API 레이트 리밋 방지

    print(f'\n📚 백필 완료: {total_success}/{total_attempted}건 성공')


if __name__ == '__main__':
    main()
