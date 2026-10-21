"""취업규칙 본문을 조문 단위로 나누고, 종전·개정안 조문을 제목·번호로 짝짓는다."""
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

NO = r"제\s*\d+\s*조(?:\s*의\s*\d+)?"
# 조 머리: 제N조(제목) · 제N조【제목】 · 제N조 본문(괄호 없음 — 조사·「제」가 바로 붙으면 본문 속 인용으로 본다)
HEAD = re.compile(rf"^\s*({NO})\s*(?:\(([^)]*)\)|【([^】]*)】|(?=\s+(?!에|의|와|과|을|를|및|부터|까지|제|·|,)\S))")
PAGE_MARK = re.compile(r"^-\s*\d+\s*-$")
TRAILING_PAGE_MARK = re.compile(r"\s+-\s*\d+\s*-\s*$")
STOP = re.compile(r"^\s*(?:부\s*칙|개정\s*부\s*칙|附\s*則|[\[【]\s*별\s*[지표]|별\s*[지표]\s*제?\s*\d+\s*호)")


@dataclass(frozen=True)
class Article:
    no: str
    title: str
    body: str


@dataclass(frozen=True)
class ArticlePair:
    no: str
    status: Literal["동일", "변경", "신설", "삭제"]
    old: Article | None
    new: Article | None
    old_no: str | None = None


def split_articles(text: str) -> list[Article]:
    found: dict[str, tuple[str, list[str]]] = {}
    current = None
    for raw in text.splitlines():
        line = TRAILING_PAGE_MARK.sub("", raw).strip()
        if not line or PAGE_MARK.match(line):
            continue
        if STOP.match(line):
            # 목차에 적힌 「부칙」은 멈춤 신호가 아니다 — 본문이 있는 조문이 하나라도 생긴 뒤에만 멈춘다
            if any(lines for _, lines in found.values()):
                break
            current = None
            continue
        m = HEAD.match(line)
        if m:
            current = re.sub(r"\s", "", m.group(1))
            title = (m.group(2) or m.group(3) or "").strip()
            rest = line[m.end():].strip()
            found[current] = (title, [rest] if rest else [])
            continue
        if current:
            found[current][1].append(line)
    return [Article(no, title, "\n".join(lines)) for no, (title, lines) in found.items()]


def _key(no: str) -> list[int]:
    return [int(x) for x in re.findall(r"\d+", no)]


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s)


def _status(a: Article, b: Article) -> str:
    return "동일" if _norm(a.body) == _norm(b.body) else "변경"


def pair_articles(old: list[Article], new: list[Article]) -> list[ArticlePair]:
    """제목이 같은 조문끼리 먼저 짝짓고(번호가 밀려도 따라간다), 남은 것은 번호로 짝짓는다."""
    old_left = {a.no: a for a in old}
    by_new: dict[str, ArticlePair] = {}
    titled = {}
    for a in old:
        if a.title:
            titled.setdefault(_norm(a.title), []).append(a)
    for b in new:
        cands = [a for a in titled.get(_norm(b.title), []) if a.no in old_left] if b.title else []
        if cands:
            a = min(cands, key=lambda x: (x.no != b.no, abs(_key(x.no)[0] - _key(b.no)[0])))
            del old_left[a.no]
            by_new[b.no] = ArticlePair(b.no, _status(a, b), a, b, a.no)
    for b in new:
        if b.no in by_new:
            continue
        a = old_left.pop(b.no, None)
        by_new[b.no] = ArticlePair(b.no, _status(a, b), a, b, a.no) if a else ArticlePair(b.no, "신설", None, b)
    pairs = list(by_new.values()) + [ArticlePair(a.no, "삭제", a, None, a.no) for a in old_left.values()]
    return sorted(pairs, key=lambda p: (_key(p.no), p.status == "삭제"))


def _docx_text(path: Path) -> str:
    import docx

    d = docx.Document(str(path))
    out = []
    for el in d.element.body.iterchildren():
        tag = el.tag.split("}")[1]
        if tag == "p":
            s = "".join(t.text or "" for t in el.iter() if t.tag.endswith("}t"))
            if s.strip():
                out.append(s)
        elif tag == "tbl":
            for tr in (x for x in el.iter() if x.tag.endswith("}tr")):
                cells = ["".join(t.text or "" for t in tc.iter() if t.tag.endswith("}t")).strip()
                         for tc in tr if tc.tag.endswith("}tc")]
                out.append(" | ".join(cells))
    return "\n".join(out)


def _hwpx_text(path: Path) -> str:
    out = []
    with zipfile.ZipFile(path) as z:
        names = sorted(n for n in z.namelist() if re.match(r"Contents/section\d+\.xml$", n))
        for name in names:
            xml = z.read(name).decode("utf-8")
            for para in re.findall(r"<hp:p\b.*?</hp:p>", xml, re.S):
                s = "".join(re.findall(r"<hp:t\b[^>]*>(.*?)</hp:t>", para, re.S))
                s = re.sub(r"<[^>]+>", "", s)
                if s.strip():
                    out.append(s)
    return "\n".join(out)


def read_text(path: Path) -> str:
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md"):
        return path.read_text(encoding="utf-8")
    if suffix == ".docx":
        return _docx_text(path)
    if suffix == ".hwpx":
        return _hwpx_text(path)
    raise ValueError("지원하지 않는 형식")
