"""
코덱스 정제 데이터 → Supabase 업로드 (기존 데이터 교체)
- cases: focus(1957) + bigcase(1073) + ilabor(145) - 중복(126) ≈ 3049건
- admin_interpretations: focus(41)건
실행: python supabase/upload_focused_data.py
"""
import json, os, sys, hashlib
from supabase import create_client

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = 'https://mewqgevgdgghhatqtuos.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or 'sb_secret_yEJ4_-YHalLfWZgPVFvgeQ_s8SkR-mX'

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

DATA_DIR = r'C:\Users\iceam\OneDrive\_10_고객\_active\yellow-envelope-db\data'


def parse_keywords(kw):
    if isinstance(kw, list):
        return kw
    if isinstance(kw, str):
        try:
            return json.loads(kw.replace("'", '"'))
        except Exception:
            return [k.strip() for k in kw.split(',') if k.strip()]
    return []


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def merge_cases():
    """focus + bigcase + ilabor 통합, 중복 제거"""
    print('📂 판례 데이터 통합...')

    # 1. Focus cases (기존 law.go.kr 정제)
    focus = load_json('yellow_envelope_cases_focus.json')
    print(f'  focus: {len(focus)}건')

    rows = {}
    for c in focus:
        cid = c.get('id', '')
        if not cid:
            continue
        rows[cid] = {
            'id': cid,
            'case_number': c.get('case_number', ''),
            'court': c.get('court', ''),
            'title': c.get('title', ''),
            'decision_date': c.get('decision_date') or None,
            'case_type': c.get('case_type', ''),
            'verdict_type': c.get('verdict_type', ''),
            'keywords_matched': parse_keywords(c.get('keywords_matched', [])
                + c.get('focus_keywords', [])),
            'summary': (c.get('summary', '') or '')[:2000],
            'holding_points': (c.get('holding_points', '') or '')[:2000],
            'law_references': c.get('law_references', ''),
            'url': c.get('url', ''),
        }

    # 2. BigCase external
    bigcase = load_json('yellow_envelope_external_cases_bigcase.json')
    print(f'  bigcase: {len(bigcase)}건')
    added_bc = 0
    for c in bigcase:
        cid = c.get('id', '')
        if not cid or cid in rows:
            continue
        rows[cid] = {
            'id': cid,
            'case_number': c.get('case_number', ''),
            'court': c.get('court', ''),
            'title': c.get('title', ''),
            'decision_date': c.get('decision_date') or None,
            'case_type': '',
            'verdict_type': '',
            'keywords_matched': parse_keywords(
                c.get('keywords_from_search', []) + c.get('focus_keywords', [])),
            'summary': (c.get('summary', '') or '')[:2000],
            'holding_points': '',
            'law_references': '',
            'url': c.get('url', ''),
        }
        added_bc += 1
    print(f'  bigcase 신규 추가: {added_bc}건')

    # 3. iLabor external (sections에서 summary 추출)
    ilabor_full = {}
    ilabor_path = os.path.join(
        r'C:\Users\iceam\OneDrive\5.산업안전\문서\Obsidian Vault\레퍼런스\최영우',
        'ilabor_판례_전체.json')
    if os.path.exists(ilabor_path):
        with open(ilabor_path, 'r', encoding='utf-8') as f:
            ilabor_full = json.load(f)

    ilabor = load_json('yellow_envelope_external_cases_ilabor.json')
    print(f'  ilabor: {len(ilabor)}건')
    added_il = 0
    for c in ilabor:
        cid = c.get('id', '')
        if not cid or cid in rows:
            continue

        # ilabor 원본에서 sections 추출
        sid_key = c.get('sid', '')
        sections = {}
        if sid_key and sid_key in ilabor_full:
            sections = ilabor_full[sid_key].get('sections', {})
        elif c.get('case_number'):
            # case_number로 검색
            for k, v in ilabor_full.items():
                if c['case_number'] in k:
                    sections = v.get('sections', {})
                    break

        summary_text = ''
        holding_text = ''
        for sec_name, sec_val in sections.items():
            if isinstance(sec_val, str):
                if '판결요지' in sec_name or '요지' in sec_name:
                    summary_text = sec_val[:2000]
                elif '판시사항' in sec_name:
                    holding_text = sec_val[:2000]

        rows[cid] = {
            'id': cid,
            'case_number': c.get('case_number', ''),
            'court': '',
            'title': (c.get('title', '') or '')[:500],
            'decision_date': None,
            'case_type': '',
            'verdict_type': '',
            'keywords_matched': parse_keywords(c.get('focus_keywords', [])),
            'summary': summary_text,
            'holding_points': holding_text,
            'law_references': '',
            'url': f"https://ilabor.co.kr/main/sub03_01_01.php?sid={c.get('sid', '')}",
        }
        added_il += 1
    print(f'  ilabor 신규 추가: {added_il}건')

    return list(rows.values())


def upload_cases(rows):
    print(f'\n📤 판례 {len(rows)}건 업로드...')
    # 기존 데이터 삭제
    sb.table('cases').delete().neq('id', '').execute()

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        sb.table('cases').upsert(batch).execute()
        print(f'  {i+len(batch)}/{len(rows)}')
    print(f'✅ 판례 {len(rows)}건 완료')


def upload_admin():
    print('\n📂 행정해석 로딩...')
    admin = load_json('yellow_envelope_admin_focus.json')
    print(f'  focus: {len(admin)}건')

    rows = []
    for a in admin:
        summary = a.get('question_summary') or a.get('summary', '') or ''
        answer = a.get('answer_summary', '') or ''
        reasoning = a.get('reasoning', '') or ''
        holding = f"{answer}\n{reasoning}".strip() if (answer or reasoning) else (a.get('holding_points', '') or '')
        rows.append({
            'id': a.get('id', ''),
            'title': a.get('title', ''),
            'doc_number': a.get('agenda_number') or a.get('doc_number', ''),
            'decision_date': a.get('interpretation_date') or a.get('decision_date') or None,
            'keywords_matched': parse_keywords(
                a.get('keywords_matched', []) + a.get('focus_keywords', [])),
            'summary': summary[:2000],
            'holding_points': holding[:2000],
            'url': a.get('url', ''),
        })

    # 기존 데이터 삭제
    sb.table('admin_interpretations').delete().neq('id', '').execute()

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        sb.table('admin_interpretations').upsert(batch).execute()
        print(f'  {i+len(batch)}/{len(rows)}')
    print(f'✅ 행정해석 {len(rows)}건 완료')


if __name__ == '__main__':
    case_rows = merge_cases()
    upload_cases(case_rows)
    upload_admin()
    print('\n🎉 전체 업로드 완료!')
