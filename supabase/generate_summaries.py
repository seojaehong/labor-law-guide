"""
판례 summary 빈값 → OpenAI로 요약 생성 + Supabase 업데이트
실행: python supabase/generate_summaries.py
"""
import json, os, sys, time, re
from supabase import create_client

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = os.environ.get('SUPABASE_URL') or 'https://mewqgevgdgghhatqtuos.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or input('Supabase Service Role Key: ')
OPENAI_KEY = os.environ.get('OPENAI_API_KEY') or input('OpenAI API Key: ')

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

def generate_summary(title, holding_points, case_number):
    """holding_points로부터 1~2줄 요약 생성"""
    import urllib.request

    prompt = f"""다음 판례의 판시사항을 1~2문장으로 핵심만 요약하세요. 법률 전문용어를 유지하되 간결하게.

사건번호: {case_number}
사건명: {title}
판시사항:
{holding_points[:1500]}

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
    # summary 빈값 + holding_points 있는 건 조회
    print('📂 summary 빈값 판례 조회...')

    all_empty = []
    offset = 0
    while True:
        result = sb.table('cases').select('id, case_number, title, holding_points') \
            .or_('summary.is.null,summary.eq.') \
            .neq('holding_points', '') \
            .range(offset, offset + 999) \
            .execute()
        if not result.data:
            break
        all_empty.extend(result.data)
        offset += 1000
        if len(result.data) < 1000:
            break

    print(f'  대상: {len(all_empty)}건 (holding_points 있는 건)')

    success = 0
    fail = 0

    for i, case in enumerate(all_empty):
        try:
            summary = generate_summary(
                case['title'],
                case['holding_points'],
                case['case_number']
            )

            sb.table('cases').update({'summary': summary[:2000]}).eq('id', case['id']).execute()
            success += 1

            if (i + 1) % 50 == 0:
                print(f'  진행: {i+1}/{len(all_empty)} (성공: {success}, 실패: {fail})')

            time.sleep(0.2)  # rate limit

        except Exception as e:
            fail += 1
            print(f'  ❌ {case["case_number"]}: {e}')
            time.sleep(1)

    print(f'\n✅ 완료: 성공 {success}건, 실패 {fail}건')


if __name__ == '__main__':
    main()
