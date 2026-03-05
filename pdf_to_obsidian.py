"""
PDF → 옵시디언 마크다운 고품질 변환
pdfplumber로 직접 추출 → 구조화 → callout 적용
"""
import sys, re, os
sys.stdout.reconfigure(encoding='utf-8')
import pdfplumber

VAULT_DIR = 'C:/Users/iceam/OneDrive/5.산업안전/문서/Obsidian Vault/레퍼런스/노동조합법'
os.makedirs(VAULT_DIR, exist_ok=True)


def extract_pdf(path: str) -> str:
    """PDF 전체 텍스트 추출"""
    pages = []
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            text = pg.extract_text()
            if text:
                # Remove page number lines like "- 3 -" or standalone "3"
                text = re.sub(r'^- \d+ -\s*$', '', text, flags=re.MULTILINE)
                # Fix spaced nakjeom: "지배 ･ 결정" → "지배·결정"
                text = text.replace(' ･ ', '·')
                text = text.replace('･', '·')
                pages.append(text)
    return '\n\n'.join(pages)


def is_special_start(s: str) -> bool:
    """이 줄이 새 블록/항목의 시작인지"""
    return bool(
        s.startswith('#') or
        re.match(r'^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)[\.\s]', s) or
        re.match(r'^[①②③④⑤⑥⑦⑧⑨⑩☞◆❖▶∙▴]', s) or
        re.match(r'^제\d+조', s) or
        re.match(r'^제\d+장', s) or
        re.match(r'^\d+\.\s', s) or
        re.match(r'^<\d>', s) or
        re.match(r'^\[참고\]', s) or
        re.match(r'^(대법원|헌법재판소|서울고등|서울행정|부산)', s) or
        s.startswith('판시사항') or
        s.startswith('- ') or
        '····' in s or
        re.match(r'^-?\s*\d{1,2}\s*-?$', s)  # page numbers
    )


def ends_sentence(s: str) -> bool:
    """한국어 문장이 자연스럽게 끝나는지"""
    s = s.rstrip()
    if not s:
        return True
    if s[-1] in '.;:)!?':
        return True
    return bool(re.search(
        r'(있음|없음|한다|된다|본다|의미함|포함함|시행함|위함임|같다|것임|'
        r'아니다|수 있음|봄|함|임|것이다|바 있다|있다|없다|'
        r'어려움|곤란|필요|하였음|판단함|해당함|인정됨|의미|수 없음|'
        r'가능함|불가|가능성|경우)\s*$', s
    ))


def merge_broken_lines(text: str) -> str:
    """PDF 줄바꿈 병합 — 문장 중간 끊김 수정"""
    lines = text.split('\n')
    merged = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        s = line.strip()

        if not s:
            merged.append('')
            i += 1
            continue

        # Keep special lines as-is (don't merge INTO them)
        if is_special_start(s):
            merged.append(line)
            i += 1
            continue

        # Regular line: try to merge forward
        current = s
        while i + 1 < len(lines):
            next_s = lines[i + 1].strip()

            # Don't merge across empty lines or special starts
            if not next_s or is_special_start(next_s):
                break

            # If current already ends naturally, stop
            if ends_sentence(current):
                break

            # Merge
            current = current + ' ' + next_s
            i += 1

        merged.append(current)
        i += 1

    return '\n'.join(merged)


def structurize(text: str, doc_type: str) -> str:
    """마크다운 구조화 — 헤더, callout 등"""
    lines = text.split('\n')
    result = []

    for i, line in enumerate(lines):
        s = line.strip()

        # Skip empty
        if not s:
            if not result or result[-1] != '':
                result.append('')
            continue

        # Skip page headers/footers/page numbers
        if s.startswith('www.moel.go.kr'):
            continue
        if re.match(r'^-?\s*\d{1,2}\s*-?$', s):  # "3", "- 3 -", etc
            continue
        # Skip orphan roman numeral lines from TOC (Ⅰ. Ⅱ. etc without content)
        if re.match(r'^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)\.\s*$', s):
            continue

        # Skip TOC lines (with dots)
        if '····' in s:
            continue

        # "목 차" skip
        if s == '목 차':
            continue

        # Chapter headers → ##
        ch_match = re.match(r'^제(\d+)장\s+(.+)', s)
        if ch_match:
            result.append(f'## 제{ch_match.group(1)}장 {ch_match.group(2)}')
            continue

        # Roman numeral sections → ###
        roman_match = re.match(r'^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)[\.\s]+(.+)', s)
        if roman_match:
            result.append(f'### {roman_match.group(1)}. {roman_match.group(2)}')
            continue

        # Numbered sub-sections (1. 정의, 2. 판단원칙 등) → ####
        num_header = re.match(r'^(\d+)\.\s+(.{2,20})$', s)
        if num_header and len(s) < 30:
            result.append(f'#### {num_header.group(1)}. {num_header.group(2)}')
            continue

        # 제N조 조문 → callout
        if re.match(r'^제\d+조(\(|의\d|\s)', s):
            result.append(f'> [!법조문] {s}')
            continue

        # 판시사항 / 판례 → callout
        if s.startswith('판시사항'):
            result.append(f'> [!판례] {s}')
            continue
        if re.match(r'^(대법원|헌법재판소)\s+\d{4}', s):
            result.append(f'> [!판례] {s}')
            continue

        # ☞ 해석포인트
        if s.startswith('☞'):
            result.append(f'> [!해석포인트] {s[1:].strip()}')
            continue

        # ❖ 정보
        if s.startswith('❖'):
            result.append(f'> [!info] {s[1:].strip()}')
            continue

        # ① ② ③ → numbered list
        circle = re.match(r'^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)', s)
        if circle:
            num_map = {'①':'1','②':'2','③':'3','④':'4','⑤':'5',
                       '⑥':'6','⑦':'7','⑧':'8','⑨':'9','⑩':'10'}
            result.append(f'{num_map.get(circle.group(1), "•")}. {circle.group(2)}')
            continue

        # Bullet: - ∙ •
        if s.startswith('- ') or s.startswith('∙ ') or s.startswith('• '):
            result.append(f'- {s[1:].strip()}')
            continue

        # "quoted phrase" on its own line → bold
        if re.match(r'^"[^"]+"\s*$', s) and len(s) < 60:
            result.append(f'**{s}**')
            continue

        # <N> sub-items in 매뉴얼
        angle_match = re.match(r'^<(\d+)>\s+(.+)', s)
        if angle_match:
            result.append(f'#### ({angle_match.group(1)}) {angle_match.group(2)}')
            continue

        # [참고] → callout
        if s.startswith('[참고]'):
            result.append(f'> [!참고] {s[4:].strip()}')
            continue

        # * footnote
        if s.startswith('* ') and len(s) < 100:
            result.append(f'> [!footnote] {s[1:].strip()}')
            continue

        # Default
        result.append(s)

    return '\n'.join(result)


def add_frontmatter(text: str, title: str, tags: list) -> str:
    tags_str = ', '.join(f'"{t}"' for t in tags)
    fm = f"""---
title: "{title}"
source: "고용노동부 (www.moel.go.kr)"
tags: [{tags_str}]
date: 2026-03-05
---

# {title}

"""
    return fm + text


def post_process(text: str) -> str:
    """최종 후처리"""
    # Fix spaced nakjeom: "지배 · 결정" → "지배·결정"
    text = re.sub(r'(\S) · (\S)', r'\1·\2', text)
    # Fix orphan "· " at line start
    text = re.sub(r'\n· ', '\n', text)
    # Merge split chapter headers: "제N장\n개 요" → "## 제N장 개요"
    text = re.sub(r'^(제\d+장)\n(.+)$', lambda m: f'## {m.group(1)} {m.group(2).strip()}', text, flags=re.MULTILINE)
    # Fix standalone "1 정 의" → "#### 1. 정의"
    text = re.sub(r'^(\d+)\s+(.{2,15})\s*$',
                  lambda m: f'#### {m.group(1)}. {m.group(2).replace(" ","")}',
                  text, flags=re.MULTILINE)
    # Remove orphan markers like "➊" "➋"
    text = re.sub(r'^\s*[➊➋➌➍➎]\s*$', '', text, flags=re.MULTILINE)
    # Remove orphan "*" line
    text = re.sub(r'^\*\s*$', '', text, flags=re.MULTILINE)
    # Merge bullet continuations: "- xxx\nyyy" where yyy should merge into bullet
    lines = text.split('\n')
    fixed = []
    for j, ln in enumerate(lines):
        s = ln.strip()
        if (j > 0 and s and not s.startswith('#') and not s.startswith('>')
            and not s.startswith('-') and not s.startswith('*')
            and not re.match(r'^[①②③④⑤⑥⑦⑧⑨⑩☞◆❖▶∙▴\d]', s)
            and not re.match(r'^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|제\d|##|>)', s)
            and fixed and fixed[-1].strip().startswith('- ')):
            fixed[-1] = fixed[-1].rstrip() + ' ' + s
        else:
            fixed.append(ln)
    return '\n'.join(fixed)


def clean_consecutive_empties(text: str) -> str:
    return re.sub(r'\n{3,}', '\n\n', text)


def process_pdf(pdf_path: str, title: str, tags: list, output_name: str, doc_type: str):
    print(f'Processing: {os.path.basename(pdf_path)}')

    # Extract
    raw = extract_pdf(pdf_path)
    print(f'  Raw: {len(raw)} chars, {raw.count(chr(10))} lines')

    # Merge broken lines
    merged = merge_broken_lines(raw)
    print(f'  Merged: {len(merged)} chars, {merged.count(chr(10))} lines')

    # Structurize
    structured = structurize(merged, doc_type)

    # Post-processing
    structured = post_process(structured)

    # Add frontmatter
    final = add_frontmatter(structured, title, tags)
    final = clean_consecutive_empties(final)

    # Write
    out_path = os.path.join(VAULT_DIR, output_name)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(final)

    # Stats
    lines = final.split('\n')
    callouts = sum(1 for l in lines if '> [!' in l)
    headers = sum(1 for l in lines if re.match(r'^#{1,4}\s', l))
    print(f'  → {output_name}: {len(lines)} lines, {headers} headers, {callouts} callouts')
    return out_path


# ===== Main =====
print('=== PDF → 옵시디언 재파싱 ===\n')

p1 = process_pdf(
    'C:/Users/iceam/Downloads/개정_노동조합법_해석지침.pdf',
    '개정 노동조합법 해석지침',
    ['노동조합법', '해석지침', '사용자범위확대', '노동쟁의'],
    '개정 노동조합법 해석지침.md',
    'guide'
)

print()

p2 = process_pdf(
    'C:/Users/iceam/Downloads/260227_노조법_교섭절차매뉴얼.pdf',
    '원·하청 상생 교섭절차 매뉴얼',
    ['노동조합법', '교섭절차', '원하청교섭', '교섭창구단일화'],
    '원·하청 상생 교섭절차 매뉴얼.md',
    'manual'
)

# MOC
moc_content = """---
title: "노동조합법 개정 (2026)"
tags: ["노동조합법", "MOC", "개정법"]
date: 2026-03-05
---

# 노동조합법 개정 (2026) — Map of Content

> 2025.9.9. 일부개정, 2026.3.10. 시행

## 핵심 문서

- [[개정 노동조합법 해석지침]] — 사용자 범위 확대 + 노동쟁의 대상 확대
- [[원·하청 상생 교섭절차 매뉴얼]] — 교섭창구단일화, 교섭단위 분리, 쟁의조정

## 주요 개정 내용

### 사용자 범위 확대 (제2조제2호)
- **계약외사용자** 개념 신설: 근로계약 당사자가 아니어도 실질적·구체적 지배력이 있으면 사용자
- 판단기준: 실질적 지배력 + 구체적 근로조건별 판단

### 노동쟁의 대상 확대 (제2조제5호)
- 근로조건에 영향을 미치는 **사업경영상의 결정** 포함
- 근로자 **지위의 결정**에 관한 주장 포함
- 사용자의 **명백한 단체협약 위반** 포함

### 교섭절차 (매뉴얼)
- 교섭창구단일화 → 교섭단위 분리 → 교섭대표 결정 → 단체교섭
- 원청사용자와의 교섭 가능 (제2조제2호 후단)

## 관련 레퍼런스

- [[최영우_노동법실무]] (기존 레퍼런스)
- 원문 PDF: [고용노동부](https://www.moel.go.kr)

## 키워드
`#사용자범위확대` `#계약외사용자` `#노동쟁의` `#교섭창구단일화` `#원하청교섭`
"""

moc_path = os.path.join(VAULT_DIR, '노동조합법 개정 2026 MOC.md')
with open(moc_path, 'w', encoding='utf-8') as f:
    f.write(moc_content)

print(f'\nMOC: {moc_path}')
print('\n=== 완료 ===')
