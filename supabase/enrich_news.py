"""
뉴스 데이터 보강: Google News URL → 실제 URL 변환 + 본문 크롤링 + 요약 생성
실행: python supabase/enrich_news.py
"""
import json, os, sys, time, hashlib, urllib.request
from supabase import create_client
from googlenewsdecoder import new_decoderv1

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = 'https://mewqgevgdgghhatqtuos.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or input('Supabase Service Role Key: ')
OPENAI_KEY = os.environ.get('OPENAI_API_KEY') or input('OpenAI API Key: ')

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

DATA_DIR = r'C:\Users\iceam\OneDrive\_10_고객\_active\yellow-envelope-db\data'


def decode_google_url(google_url):
    """Google News RSS URL → 실제 기사 URL"""
    try:
        result = new_decoderv1(google_url)
        if result.get('status'):
            return result['decoded_url']
    except:
        pass
    return google_url  # 실패 시 원본 반환


def fetch_article_text(url):
    """기사 URL에서 본문 텍스트 추출 (간단한 방식)"""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        resp = urllib.request.urlopen(req, timeout=10)
        html = resp.read().decode('utf-8', errors='ignore')

        # 간단한 태그 제거로 텍스트 추출
        import re
        # script, style 제거
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
        # 태그 제거
        text = re.sub(r'<[^>]+>', ' ', html)
        # 연속 공백 정리
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:3000]  # 3000자까지
    except:
        return ''


def generate_summary(title, article_text):
    """기사 본문에서 2~3줄 요약 생성"""
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
    print('📂 뉴스 원본 로딩...')
    with open(os.path.join(DATA_DIR, 'yellow_envelope_news.json'), 'r', encoding='utf-8') as f:
        news = json.load(f)

    print(f'  전체: {len(news)}건')

    rows = []
    success = 0
    fail = 0

    for i, n in enumerate(news):
        google_url = n.get('link', '')
        title = n.get('title', '')

        # 1. URL 디코딩
        real_url = decode_google_url(google_url)

        # 2. 기사 본문 크롤링
        article_text = fetch_article_text(real_url)

        # 3. 요약 생성
        summary = ''
        if article_text:
            try:
                summary = generate_summary(title, article_text)
                success += 1
            except Exception as e:
                fail += 1
                print(f'  ❌ 요약 실패 [{i+1}] {title[:30]}: {e}')
                time.sleep(1)
        else:
            fail += 1

        # ID 생성
        nid = n.get('id', '')
        if not nid and google_url:
            nid = f"news_{hashlib.md5(google_url.encode()).hexdigest()[:16]}"

        rows.append({
            'id': nid,
            'title': title,
            'source': n.get('source', ''),
            'published_at': n.get('published_at') or None,
            'url': real_url,
            'summary': summary[:1000],
            'keywords_matched': n.get('keywords_matched') or [],
        })

        if (i + 1) % 20 == 0:
            print(f'  진행: {i+1}/{len(news)} (요약성공: {success}, 실패: {fail})')

        time.sleep(0.3)

    # Supabase 업로드
    print(f'\n📤 Supabase 업로드...')

    # 기존 뉴스 삭제 후 재적재
    sb.table('news').delete().neq('id', '').execute()

    batch_size = 100
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        sb.table('news').upsert(batch).execute()
        print(f'  업로드 {i+len(batch)}/{len(rows)}')

    print(f'\n✅ 완료: 요약성공 {success}건, 실패 {fail}건')
    print(f'  실제 URL 변환: {sum(1 for r in rows if "news.google.com" not in r["url"])}건')


if __name__ == '__main__':
    main()
