"""
노조법 MD 파일 → 옵시디언 최적화 재파싱
1. PDF 줄바꿈 아티팩트 제거 (빈줄 사이 문장 병합)
2. 구조화: 조문/판례/정의/기준을 옵시디언 callout으로 변환
3. 로마숫자 섹션(Ⅰ,Ⅱ,Ⅲ) → ### 서브헤딩
4. 번호 나열(①②③) → ordered list
"""
import sys, re, os
sys.stdout.reconfigure(encoding='utf-8')

def remove_line_break_artifacts(text: str) -> str:
    """PDF 추출 시 발생하는 줄바꿈 아티팩트 제거"""
    lines = text.split('\n')
    merged = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Skip frontmatter
        if line.strip() == '---':
            merged.append(line)
            i += 1
            continue

        # Keep headers as-is
        if line.strip().startswith('#'):
            if merged and merged[-1].strip() != '':
                merged.append('')
            merged.append(line)
            i += 1
            continue

        # Keep truly empty lines (paragraph breaks) but collapse consecutive empties
        if line.strip() == '':
            # Check if this is a PDF artifact (empty line between continuation lines)
            if (i > 0 and i + 1 < len(lines)
                and lines[i-1].strip() != ''
                and lines[i+1].strip() != ''
                and not lines[i+1].strip().startswith('#')
                and not lines[i+1].strip().startswith('-')
                and not lines[i+1].strip().startswith('*')
                and not lines[i+1].strip().startswith('>')
                and not re.match(r'^[①②③④⑤⑥⑦⑧⑨⑩☞◆❖▶•∙]', lines[i+1].strip())
                and not re.match(r'^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)', lines[i+1].strip())
                and not re.match(r'^제\d+조', lines[i+1].strip())
                and not re.match(r'^<\d>', lines[i+1].strip())
                and not re.match(r'^\d+\s*$', lines[i+1].strip())  # standalone number
                ):
                # Check if previous line ends mid-sentence
                prev = lines[i-1].strip()
                next_line = lines[i+1].strip()

                # Sentence-ending patterns (Korean)
                ends_sentence = re.search(r'(있음|없음|하였음|한다|된다|한다\.|이다|있다|된다|않는다|한다는|포함함|의미함|의미|시행함|위함임|같다|본다|본다\.|만한다|아니다|것임|수 있음|했음|봄|함|임)\s*$', prev)
                # ends with period or colon
                ends_punct = prev.endswith('.') or prev.endswith(':') or prev.endswith(';')
                # Next starts a new topic/section
                starts_new = re.match(r'^(제\d|[0-9]+[\.\)]\s|판시사항|☞|◆|❖|▶|\[참고\]|<|"[^"]{1,10}"$)', next_line)

                if ends_sentence or ends_punct or starts_new:
                    # This is a real paragraph break — keep the empty line
                    merged.append('')
                else:
                    # PDF artifact — skip the empty line (merge)
                    i += 1
                    continue
            else:
                # Avoid consecutive empty lines
                if not merged or merged[-1].strip() != '':
                    merged.append('')
            i += 1
            continue

        merged.append(line)
        i += 1

    return '\n'.join(merged)


def add_obsidian_callouts(text: str) -> str:
    """조문, 판례, 정의, 기준을 옵시디언 callout으로 변환"""
    lines = text.split('\n')
    result = []
    i = 0
    in_frontmatter = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Handle frontmatter
        if stripped == '---':
            in_frontmatter = not in_frontmatter
            result.append(line)
            i += 1
            continue
        if in_frontmatter:
            result.append(line)
            i += 1
            continue

        # Skip "목 차" line
        if stripped == '목 차':
            i += 1
            continue

        # Roman numeral sections → ### 서브헤딩
        roman_match = re.match(r'^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)\s*(.+)', stripped)
        if roman_match:
            result.append(f'### {roman_match.group(1)} {roman_match.group(2)}')
            i += 1
            continue

        # 제N조 조문 블록 → callout
        if re.match(r'^제\d+조(\(|의\d)', stripped) or re.match(r'^제\d+조\(.+\)', stripped):
            callout_lines = [f'> [!법조문] {stripped}']
            i += 1
            # Collect continuation lines (indented or until empty line)
            while i < len(lines) and lines[i].strip() != '' and not lines[i].strip().startswith('#'):
                next_stripped = lines[i].strip()
                # Stop if we hit a non-article line
                if re.match(r'^(Ⅰ|Ⅱ|Ⅲ|판시사항|☞|")', next_stripped):
                    break
                callout_lines.append(f'> {next_stripped}')
                i += 1
            result.extend(callout_lines)
            result.append('')
            continue

        # 판시사항 / 판례 → callout
        if stripped.startswith('판시사항') or re.match(r'^(대법원|헌법재판소|서울고등법원|서울행정법원)\s+\d', stripped):
            case_info = stripped
            callout_lines = [f'> [!판례] {case_info}']
            i += 1
            while i < len(lines) and lines[i].strip() != '' and not lines[i].strip().startswith('#'):
                next_stripped = lines[i].strip()
                if re.match(r'^(Ⅰ|Ⅱ|Ⅲ|\d+\s*$|제\d+장)', next_stripped):
                    break
                callout_lines.append(f'> {next_stripped}')
                i += 1
            result.extend(callout_lines)
            result.append('')
            continue

        # ☞ 해석 포인트 → callout
        if stripped.startswith('☞'):
            callout_lines = [f'> [!해석포인트] {stripped[1:].strip()}']
            i += 1
            while i < len(lines) and lines[i].strip() != '' and not lines[i].strip().startswith('#'):
                next_stripped = lines[i].strip()
                if re.match(r'^(☞|Ⅰ|Ⅱ|Ⅲ|\d+\s*$|제\d+장)', next_stripped):
                    break
                callout_lines.append(f'> {next_stripped}')
                i += 1
            result.extend(callout_lines)
            result.append('')
            continue

        # ❖ 용어례 / 참고 → callout
        if stripped.startswith('❖'):
            callout_lines = [f'> [!info] {stripped[1:].strip()}']
            i += 1
            while i < len(lines) and lines[i].strip() != '' and not lines[i].strip().startswith('#'):
                callout_lines.append(f'> {lines[i].strip()}')
                i += 1
            result.extend(callout_lines)
            result.append('')
            continue

        # Numbered items ①②③ → list
        circle_match = re.match(r'^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)', stripped)
        if circle_match:
            num_map = {'①':'1', '②':'2', '③':'3', '④':'4', '⑤':'5',
                       '⑥':'6', '⑦':'7', '⑧':'8', '⑨':'9', '⑩':'10'}
            num = num_map.get(circle_match.group(1), '•')
            result.append(f'{num}. {circle_match.group(2)}')
            i += 1
            continue

        # Bullet points with ∙ or •
        if stripped.startswith('∙') or stripped.startswith('•'):
            result.append(f'- {stripped[1:].strip()}')
            i += 1
            continue

        # "quoted phrase" as definition → bold
        if re.match(r'^"[^"]+"\s*$', stripped):
            result.append(f'**{stripped}**')
            i += 1
            continue

        # Standalone numbers (like "1\n\n정의") — merge with next
        if re.match(r'^\d+\s*$', stripped):
            num = stripped.strip()
            i += 1
            # Skip empty line
            while i < len(lines) and lines[i].strip() == '':
                i += 1
            if i < len(lines):
                result.append(f'### {num}. {lines[i].strip()}')
                i += 1
            continue

        # [참고] blocks
        if stripped.startswith('[참고]'):
            callout_lines = [f'> [!참고] {stripped[4:].strip()}']
            i += 1
            while i < len(lines) and lines[i].strip() != '' and not lines[i].strip().startswith('#'):
                callout_lines.append(f'> {lines[i].strip()}')
                i += 1
            result.extend(callout_lines)
            result.append('')
            continue

        # Default: pass through
        result.append(line)
        i += 1

    return '\n'.join(result)


def fix_bad_headers(text: str) -> str:
    """조문 내용이 ## 헤더로 잘못 파싱된 것 수정"""
    lines = text.split('\n')
    result = []
    for line in lines:
        stripped = line.strip()
        # "## 2. "사용자"라 함은..." — 조문인데 헤더로 잘못 된 것
        if stripped.startswith('## ') and re.match(r'^## \d+\.\s*"', stripped):
            # This is article content, not a header
            result.append(stripped[3:])  # remove "## "
        # "## 2. 원·하청교섭체계····" — 목차인데 헤더로 잘못 된 것
        elif stripped.startswith('## ') and '····' in stripped:
            # Skip TOC-like entries
            continue
        else:
            result.append(line)
    return '\n'.join(result)


def clean_toc_dots(text: str) -> str:
    """목차의 ···· 패턴 제거"""
    return re.sub(r'·{3,}\d*', '', text)


def process_file(input_path: str, output_path: str):
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Step 1: Fix misplaced headers
    content = fix_bad_headers(content)

    # Step 2: Clean TOC dots
    content = clean_toc_dots(content)

    # Step 3: Remove line break artifacts
    content = remove_line_break_artifacts(content)

    # Step 4: Add Obsidian callouts
    content = add_obsidian_callouts(content)

    # Step 5: Clean up excessive empty lines
    content = re.sub(r'\n{3,}', '\n\n', content)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)

    # Stats
    lines = content.split('\n')
    callouts = sum(1 for l in lines if l.startswith('> [!'))
    headers = sum(1 for l in lines if l.startswith('#'))
    print(f'  → {os.path.basename(output_path)}: {len(lines)} lines, {headers} headers, {callouts} callouts')


# Output directory
vault_dir = 'C:/Users/iceam/OneDrive/5.산업안전/문서/Obsidian Vault/레퍼런스/노동조합법'
os.makedirs(vault_dir, exist_ok=True)

# Process both files
src_dir = 'C:/Users/iceam/Downloads/노조법_옵시디언_최종'

files = [
    ('개정_노동조합법_해석지침_perfect.md', '개정 노동조합법 해석지침.md'),
    ('원·하청_상생_교섭절차_매뉴얼_perfect.md', '원·하청 상생 교섭절차 매뉴얼.md'),
]

print('=== 옵시디언 재파싱 시작 ===')
for src_name, out_name in files:
    src_path = os.path.join(src_dir, src_name)
    out_path = os.path.join(vault_dir, out_name)
    print(f'Processing: {src_name}')
    process_file(src_path, out_path)

# Create MOC (Map of Content)
moc = """---
title: "노동조합법 개정 (2026)"
tags: [노동조합법, MOC, 개정법]
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
- 원문 PDF: [고용노동부 KCPLAA](https://www.kcplaa.or.kr)

## 키워드
`#사용자범위확대` `#계약외사용자` `#노동쟁의` `#교섭창구단일화` `#원하청교섭`
"""

moc_path = os.path.join(vault_dir, '노동조합법 개정 2026 MOC.md')
with open(moc_path, 'w', encoding='utf-8') as f:
    f.write(moc)
print(f'\nMOC created: {moc_path}')
print('\n=== 완료 ===')
