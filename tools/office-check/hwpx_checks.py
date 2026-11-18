"""HWPX structure and finishing checks.

Plain-text checks miss most of what goes wrong in a generated .hwpx: the file
opens in a viewer, the text extracts fine, and yet Hangul stalls on it, reports
it as damaged, or prints a placeholder style. Each check below targets one of
those failure modes.

Every function returns a list of (level, code, message) tuples where level is
"ERROR", "WARN" or "INFO".
"""
from __future__ import annotations

import re
import zipfile
from collections import Counter
from pathlib import Path

from defusedxml.ElementTree import fromstring

HWPX_MIME = "application/hwp+zip"
SECTION_RE = re.compile(r"^Contents/section\d+\.xml$")

# Phrases that only appear in the instructions of a blank form. If they survive
# into a finished document, the form was filled in around its own guidance text.
FORM_INSTRUCTIONS = ["작성할 것", "있다면 기입", "예시)", "중 택1", "현장확인:", "현장확인 :"]
EMPTY_ANSWERS = {"→", "->"}
# A space before a colon ("일시 : ..."). The signature line "성 명 :" is a
# conventional exception.
COLON_SPACE = re.compile(r"[가-힣A-Za-z0-9)）\]] +:")

BODY_RUN_MIN = 60   # a run this long is body text
SHORT_RUN_MIN = 8   # table cells and short lines
LONG_TABLE_ROWS = 15


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _iter(root, name):
    for el in root.iter():
        if local(el.tag) == name:
            yield el


def _text_of(run) -> str:
    return "".join("".join(t.itertext()) for t in run if local(t.tag) == "t")


def check_package(z: zipfile.ZipFile) -> list:
    out = []
    infos = z.infolist()
    if not infos:
        return [("ERROR", "zip", "empty archive")]
    first = infos[0]
    if first.filename != "mimetype":
        out.append(("ERROR", "mimetype", f"first zip entry is {first.filename!r}, must be 'mimetype'"))
    if "mimetype" in z.namelist():
        info = z.getinfo("mimetype")
        if info.compress_type != zipfile.ZIP_STORED:
            out.append(("ERROR", "mimetype", "'mimetype' entry is compressed, must be STORED"))
        body = z.read("mimetype").decode("ascii", "replace").strip()
        if body != HWPX_MIME:
            out.append(("ERROR", "mimetype", f"mimetype is {body!r}, expected {HWPX_MIME!r}"))
    else:
        out.append(("ERROR", "mimetype", "no 'mimetype' entry"))
    names = set(z.namelist())
    for need in ("Contents/header.xml", "Contents/section0.xml"):
        if need not in names:
            out.append(("ERROR", "parts", f"missing {need}"))
    for want in ("Contents/content.hpf", "META-INF/container.xml", "version.xml"):
        if want not in names:
            out.append(("WARN", "parts", f"missing {want}"))
    return out


def parse_parts(z: zipfile.ZipFile):
    """Parse every XML part. Returns ({name: root}, issues)."""
    roots, out = {}, []
    for name in z.namelist():
        if not (name.endswith(".xml") or name.endswith(".hpf") or name.endswith(".rdf")):
            continue
        try:
            roots[name] = fromstring(z.read(name))
        except Exception as e:  # noqa: BLE001 — any parse failure is the finding
            out.append(("ERROR", "xml", f"{name} is not well-formed XML: {e}"))
    return roots, out


def check_header(header) -> tuple[list, dict]:
    """itemCnt vs actual children, and collect the id sets references must hit."""
    out = []
    for el in header.iter():
        cnt = el.get("itemCnt")
        if cnt is None:
            continue
        actual = len(list(el))
        if str(actual) != cnt:
            out.append(("ERROR", "itemCnt",
                        f"<{local(el.tag)} itemCnt=\"{cnt}\"> has {actual} children (Hangul treats this as damage)"))
    ids = {}
    for kind in ("charPr", "paraPr", "borderFill", "style"):
        ids[kind] = {el.get("id") for el in _iter(header, kind)}
    return out, ids


def check_refs(sections: dict, ids: dict) -> list:
    out = []
    refs = {"charPrIDRef": "charPr", "paraPrIDRef": "paraPr", "borderFillIDRef": "borderFill", "styleIDRef": "style"}
    missing = Counter()
    for root in sections.values():
        for el in root.iter():
            for attr, kind in refs.items():
                v = el.get(attr)
                if v is not None and ids.get(kind) and v not in ids[kind]:
                    missing[(attr, v)] += 1
    for (attr, v), n in sorted(missing.items()):
        out.append(("ERROR", "idref", f'{attr}="{v}" points to no {refs[attr]} in header.xml ({n}x)'))
    return out


def check_tables(sections: dict) -> list:
    out = []
    for name, root in sections.items():
        for ti, tbl in enumerate(_iter(root, "tbl")):
            label = f"{name} table #{ti + 1}"
            rows = [r for r in tbl if local(r.tag) == "tr"]
            row_cnt = tbl.get("rowCnt")
            if row_cnt is not None and row_cnt != str(len(rows)):
                out.append(("ERROR", "table", f"{label}: rowCnt={row_cnt} but {len(rows)} <hp:tr>"))
            col_cnt = int(tbl.get("colCnt") or 0)
            row_addrs = []
            for ri, tr in enumerate(rows):
                for tc in (c for c in tr if local(c.tag) == "tc"):
                    addr = next((a for a in tc if local(a.tag) == "cellAddr"), None)
                    span = next((a for a in tc if local(a.tag) == "cellSpan"), None)
                    if addr is None:
                        out.append(("ERROR", "table", f"{label}: row {ri} has a cell without <hp:cellAddr>"))
                        continue
                    ra, ca = int(addr.get("rowAddr", -1)), int(addr.get("colAddr", -1))
                    row_addrs.append(ra)
                    if ra != ri:
                        out.append(("ERROR", "table", f"{label}: cell in row {ri} has rowAddr={ra}"))
                        break
                    cs = int(span.get("colSpan", 1)) if span is not None else 1
                    if col_cnt and ca + cs > col_cnt:
                        out.append(("ERROR", "table", f"{label}: row {ri} colAddr={ca}+colSpan={cs} exceeds colCnt={col_cnt}"))
            if tbl.get("repeatHeader") == "1" and rows:
                first = [c for c in rows[0] if local(c.tag) == "tc"]
                if first and not any(c.get("header") == "1" for c in first):
                    out.append(("WARN", "table", f"{label}: repeatHeader=1 but no first-row cell has header=\"1\" — the header row will not repeat"))
            pos = next((p for p in tbl if local(p.tag) == "pos"), None)
            if pos is not None and pos.get("treatAsChar") == "1" and len(rows) > LONG_TABLE_ROWS:
                out.append(("WARN", "table", f"{label}: {len(rows)} rows laid out 'as character' — it cannot split across pages and jumps whole; use treatAsChar=0 with pageBreak=CELL/TABLE"))
    return out


def charpr_styles(header) -> dict:
    out = {}
    for cp in _iter(header, "charPr"):
        kids = {local(k.tag) for k in cp}
        out[cp.get("id")] = (cp.get("textColor", "?"), "italic" in kids)
    return out


def check_runs(sections: dict, header) -> list:
    """Body text that kept a placeholder style (non-black or italic) from a template."""
    out = []
    styles = charpr_styles(header)
    body, short = Counter(), Counter()
    empty_answers = 0
    for root in sections.values():
        for run in _iter(root, "run"):
            text = _text_of(run).strip()
            if text in EMPTY_ANSWERS:
                empty_answers += 1
                continue
            cid = run.get("charPrIDRef")
            if cid not in styles or len(text) < SHORT_RUN_MIN:
                continue
            color, italic = styles[cid]
            if color.upper() in ("#000000", "?") and not italic:
                continue
            key = f"{color}{' italic' if italic else ''} (charPr {cid})"
            (body if len(text) >= BODY_RUN_MIN else short)[key] += 1
    if body:
        out.append(("ERROR", "style", f"body runs (>= {BODY_RUN_MIN} chars) in a placeholder style: {dict(body)}"))
    if short:
        out.append(("WARN", "style", f"runs (>= {SHORT_RUN_MIN} chars) in a non-black or italic style: {dict(short)} — check these are intended"))
    if empty_answers:
        out.append(("ERROR", "empty-answer", f"{empty_answers} run(s) contain only an arrow (answer left blank)"))
    return out


def body_text(sections: dict) -> str:
    return "\n".join(_text_of(run) for root in sections.values() for run in _iter(root, "run"))


def text_findings(text: str) -> list:
    out = []
    em = text.count("—") + text.count("–")
    if em:
        out.append(("WARN", "text", f"{em} em/en dash(es)"))
    if "###" in text:
        out.append(("WARN", "text", f"'###' x{text.count('###')} (cell too narrow, or markdown left in)"))
    colons = [m.group(0) for m in COLON_SPACE.finditer(text) if "명 :" not in m.group(0)]
    if colons:
        out.append(("WARN", "text", f"{len(colons)} space(s) before a colon, e.g. {sorted(set(colons))[:4]}"))
    for phrase in FORM_INSTRUCTIONS:
        if phrase in text:
            out.append(("ERROR", "form-text", f"form instruction left in: {phrase!r} x{text.count(phrase)}"))
    return out


def check_preview_and_bins(z: zipfile.ZipFile, sections: dict, text: str) -> list:
    """Previews and binaries copied from whatever document served as the template."""
    out = []
    names = z.namelist()
    keep = re.compile(r"[^가-힣A-Za-z0-9]")
    flat = keep.sub("", text)
    if "Preview/PrvText.txt" in names:
        pv = keep.sub("", z.read("Preview/PrvText.txt").decode("utf-8", "ignore"))[:40]
        if len(pv) >= 10 and pv[:10] not in flat:
            out.append(("WARN", "preview", f"Preview/PrvText.txt starts {pv[:20]!r}, which is not in the body — preview may come from another document"))
    if "Preview/PrvImage.png" in names:
        out.append(("INFO", "preview", f"Preview/PrvImage.png present ({z.getinfo('Preview/PrvImage.png').file_size} bytes) — confirm it shows this document, not the template's source"))
    bins = [n for n in names if n.startswith("BinData/") and not n.endswith("/")]
    if bins:
        hpf = z.read("Contents/content.hpf").decode("utf-8", "ignore") if "Contents/content.hpf" in names else ""
        refs = "".join(z.read(n).decode("utf-8", "ignore") for n in names if SECTION_RE.match(n) or n == "Contents/header.xml")
        for b in bins:
            m = re.search(r'id="([^"]+)"[^>]*href="' + re.escape(b) + '"', hpf) or re.search(
                r'href="' + re.escape(b) + r'"[^>]*id="([^"]+)"', hpf)
            item = m.group(1) if m else None
            if not item or f'"{item}"' not in refs:
                out.append(("WARN", "bindata", f"{b} is not referenced by the body — leftover from a template?"))
    return out


def check_linesegs(sections: dict) -> list:
    n = sum(1 for root in sections.values() for _ in _iter(root, "linesegarray"))
    if n:
        return [("INFO", "lineseg", f"{n} <hp:linesegarray> layout cache(s) — fine from a layout engine; if this file was edited as XML, drop them or Hangul may report damage")]
    return []


def check_hwpx(path: Path) -> list:
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile as e:
        return [("ERROR", "zip", f"not a zip archive: {e}")]
    with z:
        bad = z.testzip()
        if bad:
            return [("ERROR", "zip", f"CRC error in {bad}")]
        out = check_package(z)
        roots, issues = parse_parts(z)
        out += issues
        header = roots.get("Contents/header.xml")
        sections = {n: r for n, r in roots.items() if SECTION_RE.match(n)}
        if header is None or not sections:
            return out
        hdr_issues, ids = check_header(header)
        out += hdr_issues
        out += check_refs(sections, ids)
        out += check_tables(sections)
        out += check_runs(sections, header)
        text = body_text(sections)
        out += text_findings(text)
        out += check_preview_and_bins(z, sections, text)
        out += check_linesegs(sections)
        if not text.strip():
            out.append(("ERROR", "text", "no text in any section"))
    if not any(level in ("ERROR", "WARN") for level, *_ in out):
        out.insert(0, ("OK", "hwpx", f"package, header itemCnt/idrefs, {sum(1 for r in sections.values() for _ in _iter(r, 'tbl'))} table(s), run styles, text checks passed"))
    return out
