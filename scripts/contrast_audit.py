"""US-016 / DESIGN.md §7.3 라이트 점검표 — 측정.

globals.css의 :root·.dark 토큰을 파싱해 var() 체인을 hex까지 풀고, WCAG 2.1 대비를
계산한다. 눈으로 보는 점검이 아니라 수치로 판정한다.
"""

import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
CSS = os.path.join(ROOT, "src/app/globals.css")


def parse_blocks(text):
    """:root { ... } 와 .dark { ... } 안의 --토큰: 값; 을 각각 뽑는다."""
    out = {"light": {}, "dark": {}}
    for name, key in ((r":root", "light"), (r"\.dark", "dark")):
        for m in re.finditer(name + r"\s*\{", text):
            i = m.end()
            depth = 1
            j = i
            while j < len(text) and depth:
                if text[j] == "{":
                    depth += 1
                elif text[j] == "}":
                    depth -= 1
                j += 1
            body = text[i : j - 1]
            for dm in re.finditer(r"(--[\w-]+)\s*:\s*([^;]+);", body):
                out[key].setdefault(dm.group(1), dm.group(2).strip())
    return out


def resolve(tok, table, depth=0):
    """var() 체인을 hex/rgb 리터럴까지 푼다."""
    if depth > 12:
        return None
    v = table.get(tok)
    if v is None:
        return None
    v = v.strip()
    m = re.fullmatch(r"var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)", v)
    if m:
        return resolve(m.group(1), table, depth + 1)
    return v


def to_rgba(v):
    """알파를 살려서 돌려준다. rgba(...,a) → (r,g,b,a)"""
    if not v:
        return None
    m = re.match(r"rgba\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)[ ,/]+([\d.]+)", v.strip())
    if m:
        return (int(float(m.group(1))), int(float(m.group(2))), int(float(m.group(3))), float(m.group(4)))
    rgb = to_rgb(v)
    return (rgb[0], rgb[1], rgb[2], 1.0) if rgb else None


def composite(fg_rgba, bg_rgb):
    """반투명 전경을 불투명 배경 위에 올린 실제 색."""
    if fg_rgba is None or bg_rgb is None:
        return None
    r, g, b, a = fg_rgba
    return tuple(round(a * c + (1 - a) * d) for c, d in zip((r, g, b), bg_rgb))


def to_rgb(v):
    if not v:
        return None
    v = v.strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{6})", v)
    if m:
        h = m.group(1)
        return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))
    m = re.fullmatch(r"#([0-9a-fA-F]{3})", v)
    if m:
        h = m.group(1)
        return tuple(int(c * 2, 16) for c in h)
    m = re.match(r"rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)", v)
    if m:
        return tuple(int(float(m.group(i))) for i in (1, 2, 3))
    return None


def lum(rgb):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (ch(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg, bg):
    if not fg or not bg:
        return None
    a, b = lum(fg), lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


text = open(CSS, encoding="utf-8").read()
tables = parse_blocks(text)
# .dark는 :root를 상속한다 — 없는 토큰은 라이트 값을 쓴다.
merged_dark = dict(tables["light"])
merged_dark.update(tables["dark"])
TAB = {"light": tables["light"], "dark": merged_dark}


def val(tok, mode):
    return to_rgb(resolve(tok, TAB[mode]))


# ── 측정 대상 ─────────────────────────────────────────────────
# (설명, 전경 토큰, 배경 토큰, 기준)
PAIRS = [
    ("본문 링크 (바탕 위)", "--color-accent-ink", "--color-bg-primary", 4.5),
    ("본문 링크 hover", "--color-accent-ink-hover", "--color-bg-primary", 4.5),
    ("본문 텍스트", "--color-text-primary", "--color-bg-primary", 4.5),
    ("보조 텍스트 (바탕 위)", "--color-text-secondary", "--color-bg-primary", 4.5),
    ("보조 텍스트 (카드 위)", "--color-text-secondary", "--color-bg-elevated", 4.5),
    ("3차 텍스트 (콘텐츠 금지 확인)", "--color-text-tertiary", "--color-bg-primary", 4.5),
]
SOLID = [
    ("솔리드 accent + 흰 잉크", "--color-accent"),
    ("솔리드 accent-ink + 흰 잉크", "--color-accent-ink"),
    ("솔리드 danger + 흰 잉크", "--color-danger"),
    ("솔리드 success + 흰 잉크", "--color-success"),
    ("솔리드 warn + 흰 잉크", "--color-warn"),
]
TINT = [
    ("배지 success", "--color-success-ink", "--color-success-bg"),
    ("배지 warn", "--color-warn-ink", "--color-warn-bg"),
    ("배지 danger", "--color-danger-ink", "--color-danger-bg"),
    ("배지 info", "--color-info-ink", "--color-info-bg"),
    ("배지 brand", "--color-brand-ink", "--color-brand-surface"),
]

fails = []
print("=" * 74)
print("§7.3 라이트 점검표 — WCAG 2.1 대비 측정 (기준 4.5:1, 큰 글자 3:1)")
print("=" * 74)

for mode in ("light", "dark"):
    print(f"\n### {mode.upper()}")
    print(f"{'항목':38} {'전경':>9} {'배경':>9} {'비율':>7}  판정")
    for label, fg, bg, need in PAIRS:
        f, b = val(fg, mode), val(bg, mode)
        r = ratio(f, b)
        if r is None:
            print(f"{label:38} {'?':>9} {'?':>9} {'-':>7}  토큰 미해결")
            continue
        ok = r >= need
        mark = "OK" if ok else "★미달"
        if not ok and "금지 확인" not in label:
            fails.append((mode, label, round(r, 2), need))
        print(
            f"{label:38} {'#%02x%02x%02x'%f:>9} {'#%02x%02x%02x'%b:>9} {r:6.2f}  {mark}"
        )

    white = (255, 255, 255)
    for label, tok in SOLID:
        f = val(tok, mode)
        r = ratio(white, f)
        if r is None:
            continue
        ok = r >= 4.5
        if not ok:
            fails.append((mode, label, round(r, 2), 4.5))
        print(
            f"{label:38} {'#ffffff':>9} {'#%02x%02x%02x'%f:>9} {r:6.2f}  {'OK' if ok else '★미달'}"
        )

    page = val("--color-bg-primary", mode)
    for label, fg, bg in TINT:
        f = val(fg, mode)
        braw = to_rgba(resolve(bg, TAB[mode]))
        b = composite(braw, page) if braw else None
        r = ratio(f, b)
        if r is None:
            print(f"{label:38} {'?':>9} {'?':>9} {'-':>7}  토큰 미해결")
            continue
        ok = r >= 4.5
        if not ok:
            fails.append((mode, label, round(r, 2), 4.5))
        print(
            f"{label:38} {'#%02x%02x%02x'%f:>9} {'#%02x%02x%02x'%b:>9} {r:6.2f}  {'OK' if ok else '★미달'}"
        )

# ── 코드 스캔 ─────────────────────────────────────────────────
print("\n" + "=" * 74)
print("코드 스캔")
print("=" * 74)


def scan(pattern, label, exts=(".tsx", ".ts")):
    hits = []
    for dp, dns, fns in os.walk(os.path.join(ROOT, "src")):
        dns[:] = [d for d in dns if d not in ("node_modules", ".next")]
        for fn in fns:
            if not fn.endswith(exts):
                continue
            p = os.path.join(dp, fn)
            for i, line in enumerate(
                open(p, encoding="utf-8", errors="ignore").read().splitlines(), 1
            ):
                if re.search(pattern, line):
                    hits.append((os.path.relpath(p, ROOT), i, line.strip()[:90]))
    print(f"\n{label}: {len(hits)}건")
    for h in hits[:8]:
        print(f"   {h[0]}:{h[1]}  {h[2]}")
    if len(hits) > 8:
        print(f"   … 외 {len(hits)-8}건")
    return hits


tiny = scan(r"text-\[\d+px\]", "최소 글자 크기 — text-[Npx] 임의값")
tiny_bad = []
for h in tiny:
    m = re.search(r"text-\[(\d+)px\]", h[2])
    if m and int(m.group(1)) < 11:
        tiny_bad.append(h)
tertiary = scan(r"--color-text-tertiary", "3차 텍스트 토큰 사용처(콘텐츠 금지)")

print("\n" + "=" * 74)
print("판정")
print("=" * 74)
if fails:
    print(f"★ AA 미달 {len(fails)}건 — 값을 바꿔야 풀린다. 임의 수정하지 않고 보고한다:")
    for m, label, r, need in fails:
        print(f"   [{m}] {label}: {r}:1 (기준 {need}:1)")
else:
    print("대비 미달 없음")
print(f"11px 미만 글자: {len(tiny_bad)}건")
print(f"tertiary 사용처: {len(tertiary)}건 (콘텐츠 텍스트에 쓰였는지 개별 확인 필요)")
