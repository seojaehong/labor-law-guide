"""서식 채우기용 글꼴을 만든다: 나눔고딕에서 한글 음절 11,172자 + 기본 라틴·문장부호·기호만 남기고 힌팅을 뺀다.

왜: pdf-lib(fontkit) 서브셋은 나눔고딕 글자를 빠뜨려 그리지 못한다(261026 산재·261102 건보 실측 — 추출은 되는데 그림이 비어 있다).
그래서 서브셋을 끄고(subset:false) 글꼴 전체를 싣되, 실을 글꼴 자체를 미리 줄여 PDF 를 건보 EDI 첨부 한도 1MB 아래로 둔다.
사용: make_font.py <NanumGothic-Regular.ttf> <out.ttf>
"""
import sys

from fontTools import subset

src, out = sys.argv[1], sys.argv[2]
ranges = [
    (0x20, 0x7E),  # 기본 라틴
    (0xA0, 0xFF),  # 라틴-1 기호(·, × 등)
    (0x2010, 0x2027),  # 대시·따옴표·말줄임
    (0x2030, 0x203B),  # ‰ ※ 등
    (0x2190, 0x2193),  # 화살표
    (0x2460, 0x2473),  # ①~⑳
    (0x25A0, 0x25CF),  # ■ □ ○ ● 등
    (0x221A, 0x221A),  # √
    (0x3000, 0x3011),  # 한중일 문장부호「」『』〈〉
    (0x3131, 0x318E),  # 호환 자모 ㄱ~ㅎ
    (0xAC00, 0xD7A3),  # 한글 음절 전부
    (0xFF01, 0xFF5E),  # 전각 기호
]
unicodes = [c for a, b in ranges for c in range(a, b + 1)]
opt = subset.Options()
opt.hinting = False
opt.desubroutinize = True
opt.notdef_outline = True
opt.name_IDs = ["*"]
opt.layout_features = []
f = subset.load_font(src, opt)
s = subset.Subsetter(opt)
s.populate(unicodes=unicodes)
s.subset(f)
# OFL 3항 — 수정판은 예약 이름(Nanum, Naver Nanum, NanumGothic 등)을 글꼴 이름으로 쓸 수 없다. 이름을 바꾼다.
# 저작권 고지(ID 0)와 라이선스(ID 13·14)는 그대로 둔다. OFL.txt 를 같은 폴더에 함께 낸다.
FAMILY, PS = "LLG Forms Sans", "LLGFormsSans-Regular"
new = {1: FAMILY, 3: f"{PS};llg-forms-2026", 4: f"{FAMILY} Regular", 6: PS, 16: FAMILY, 17: "Regular"}
name = f["name"]
for rec in list(name.names):
    if rec.nameID in new:
        name.removeNames(nameID=rec.nameID)
for nid, val in new.items():
    name.setName(val, nid, 3, 1, 0x409)
    name.setName(val, nid, 1, 0, 0)
left = [r.toUnicode() for r in name.names if r.nameID in (1, 2, 3, 4, 6, 16, 17) and "nanum" in r.toUnicode().lower()]
assert not left, left
subset.save_font(f, out, opt)
print("글자", len(f.getBestCmap()), "→", out)
