"""
기존 뉴스 keywords_matched 백필
실행: python supabase/backfill_keywords.py
"""
import os, sys
from supabase import create_client

sys.stdout.reconfigure(encoding='utf-8')

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
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

KEYWORD_TAGS = [
    '노란봉투법', '노조법', '손해배상', '가압류', '단체교섭',
    '부당노동행위', '노동위원회', '쟁의행위', '파업', '원청', '하청',
    '교섭', '파견', '도급', '사용자성', '노동조합',
]


def extract_keywords(title, summary):
    text = f"{title} {summary}"
    return [kw for kw in KEYWORD_TAGS if kw in text]


def main():
    print('🔄 키워드 백필 시작...')
    offset = 0
    updated = 0

    while True:
        result = sb.table('news').select('id,title,summary').range(offset, offset + 499).execute()
        if not result.data:
            break

        for row in result.data:
            keywords = extract_keywords(row['title'] or '', row['summary'] or '')
            if keywords:
                sb.table('news').update({'keywords_matched': keywords}).eq('id', row['id']).execute()
                updated += 1

        print(f'  처리: {offset + len(result.data)}건, 업데이트: {updated}건')
        offset += 500
        if len(result.data) < 500:
            break

    print(f'✅ 백필 완료: {updated}건 업데이트')


if __name__ == '__main__':
    main()
