"""취업규칙 본문을 조문 단위로 나누고, 종전·개정안 조문을 번호로 짝짓는다."""
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

HEAD = re.compile(r"^\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*\(([^)]*)\)")
PAGE_MARK = re.compile(r"^-\s*\d+\s*-$")
TRAILING_PAGE_MARK = re.compile(r"\s+-\s*\d+\s*-\s*$")
STOP = ("부칙", "개정부칙")


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


def split_articles(text: str) -> list[Article]:
    found: dict[str, tuple[str, list[str]]] = {}
    current = None
    for raw in text.splitlines():
        line = TRAILING_PAGE_MARK.sub("", raw).strip()
        if not line or PAGE_MARK.match(line):
            continue
        if re.sub(r"\s", "", line) in STOP or line.startswith("[별지"):
            break
        m = HEAD.match(line)
        if m:
            current = m.group(1).replace(" ", "")
            rest = line[m.end():].strip()
            found[current] = (m.group(2).strip(), [rest] if rest else [])
            continue
        if current:
            found[current][1].append(line)
    return [Article(no, title, "\n".join(lines)) for no, (title, lines) in found.items()]


def _key(no: str) -> list[int]:
    return [int(x) for x in re.findall(r"\d+", no)]


def _same(a: str, b: str) -> bool:
    return re.sub(r"\s+", "", a) == re.sub(r"\s+", "", b)


def pair_articles(old: list[Article], new: list[Article]) -> list[ArticlePair]:
    o = {a.no: a for a in old}
    n = {a.no: a for a in new}
    out = []
    for no in sorted(set(o) | set(n), key=_key):
        a, b = o.get(no), n.get(no)
        if a is None:
            status = "신설"
        elif b is None:
            status = "삭제"
        else:
            status = "동일" if _same(a.body, b.body) else "변경"
        out.append(ArticlePair(no, status, a, b))
    return out


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
