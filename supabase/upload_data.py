"""
노란봉투법 DB → Supabase 업로드 스크립트
실행: python supabase/upload_data.py
환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_KEY
"""
import json, os, sys
from supabase import create_client

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = os.environ.get('SUPABASE_URL') or input('Supabase URL: ')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or input('Supabase Service Role Key: ')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

DATA_DIR = r'C:\Users\iceam\OneDrive\_10_고객\_active\yellow-envelope-db\data'

def parse_keywords(kw):
    """keywords_matched를 리스트로 변환"""
    if isinstance(kw, list):
        return kw
    if isinstance(kw, str):
        try:
            return json.loads(kw.replace("'", '"'))
        except:
            return [k.strip() for k in kw.split(',') if k.strip()]
    return []

def upload_cases():
    print('📂 판례 로딩...')
    with open(os.path.join(DATA_DIR, 'yellow_envelope_cases.json'), 'r', encoding='utf-8') as f:
        cases = json.load(f)

    rows = []
    for c in cases:
        rows.append({
            'id': c['id'],
            'case_number': c.get('case_number', ''),
            'court': c.get('court', ''),
            'title': c.get('title', ''),
            'decision_date': c.get('decision_date') or None,
            'case_type': c.get('case_type', ''),
            'verdict_type': c.get('verdict_type', ''),
            'keywords_matched': parse_keywords(c.get('keywords_matched', [])),
            'summary': (c.get('summary', '') or '')[:2000],
            'holding_points': (c.get('holding_points', '') or '')[:2000],
            'law_references': c.get('law_references', ''),
            'url': c.get('url', ''),
        })

    # Batch insert (500 per batch)
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        result = supabase.table('cases').upsert(batch).execute()
        print(f'  판례 {i+len(batch)}/{len(rows)} 업로드')

    print(f'✅ 판례 {len(rows)}건 완료')

def upload_admin():
    print('📂 행정해석 로딩...')
    with open(os.path.join(DATA_DIR, 'yellow_envelope_admin_interpretations.json'), 'r', encoding='utf-8') as f:
        admins = json.load(f)

    rows = []
    for a in admins:
        rows.append({
            'id': a.get('id', ''),
            'title': a.get('title', ''),
            'doc_number': a.get('doc_number', ''),
            'decision_date': a.get('decision_date') or None,
            'keywords_matched': parse_keywords(a.get('keywords_matched', [])),
            'summary': (a.get('summary', '') or '')[:2000],
            'holding_points': (a.get('holding_points', '') or '')[:2000],
            'url': a.get('url', ''),
        })

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        supabase.table('admin_interpretations').upsert(batch).execute()
        print(f'  행정해석 {i+len(batch)}/{len(rows)} 업로드')

    print(f'✅ 행정해석 {len(rows)}건 완료')

def upload_news():
    print('📂 뉴스 로딩...')
    with open(os.path.join(DATA_DIR, 'yellow_envelope_news.json'), 'r', encoding='utf-8') as f:
        news = json.load(f)

    rows = []
    for n in news:
        rows.append({
            'id': n.get('id', ''),
            'title': n.get('title', ''),
            'source': n.get('source', ''),
            'published_at': n.get('published_at') or n.get('published_date') or None,
            'url': n.get('url', ''),
            'summary': (n.get('summary', '') or '')[:1000],
            'keywords_matched': parse_keywords(n.get('keywords_matched', [])),
        })

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        supabase.table('news').upsert(batch).execute()
        print(f'  뉴스 {i+len(batch)}/{len(rows)} 업로드')

    print(f'✅ 뉴스 {len(rows)}건 완료')

if __name__ == '__main__':
    upload_cases()
    upload_admin()
    upload_news()
    print('\n🎉 전체 업로드 완료!')
