"""office-check — validate generated office documents.

    python tools/office-check/check.py [--strict] <file> [<file> ...]

Dispatch by extension:
  .docx/.pptx  zip + XML well-formedness, then the vendored Anthropic OOXML/XSD
               validator (third_party/anthropic-skills/scripts/office/validate.py),
               plus a few generation-rule checks (docx)
  .xlsx        zip + XML well-formedness, cached formula-error scan, and a
               LibreOffice recalculation on a temp copy when soffice is available
               (the Anthropic validator has no XSD check for xlsx)
  .hwpx        package/structure/style checks (hwpx_checks.py); a sibling .pdf
               with the same stem is checked as the rendered output
  .pdf         opens, has pages, text is extractable, fonts embedded

Exit status: 0 = no ERROR (and no WARN with --strict), 1 = findings, 2 = usage.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True  # keep __pycache__ out of the vendored tree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
VENDOR = ROOT / "third_party" / "anthropic-skills" / "scripts"
sys.path.insert(0, str(HERE))

from defusedxml.ElementTree import fromstring  # noqa: E402

import hwpx_checks  # noqa: E402

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SOFFICE_DIRS = [
    r"C:\Program Files\LibreOffice\program",
    r"C:\Program Files (x86)\LibreOffice\program",
    "/Applications/LibreOffice.app/Contents/MacOS",
    "/usr/lib/libreoffice/program",
    "/opt/libreoffice/program",
]


def env_utf8(extra_path: str | None = None) -> dict:
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8", PYTHONDONTWRITEBYTECODE="1")
    if extra_path:
        env["PATH"] = extra_path + os.pathsep + env.get("PATH", "")
    return env


def find_soffice() -> str | None:
    """Directory holding soffice, or None."""
    hit = shutil.which("soffice")
    if hit:
        return str(Path(hit).parent)
    for d in SOFFICE_DIRS:
        for exe in ("soffice.exe", "soffice"):
            if (Path(d) / exe).exists():
                return d
    return None


# ── shared OOXML package checks ─────────────────────────────────────────

def check_zip_xml(path: Path) -> list:
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile as e:
        return [("ERROR", "zip", f"not a zip archive: {e}")]
    out = []
    with z:
        bad = z.testzip()
        if bad:
            return [("ERROR", "zip", f"CRC error in {bad}")]
        names = z.namelist()
        if "[Content_Types].xml" not in names:
            out.append(("ERROR", "zip", "missing [Content_Types].xml"))
        folders = [n for n in names if n.endswith("/")]
        if folders:
            out.append(("WARN", "zip", f"{len(folders)} folder entr{'y' if len(folders) == 1 else 'ies'} in the zip — cloud co-editing has refused such files"))
        for n in names:
            if n.endswith((".xml", ".rels")):
                try:
                    fromstring(z.read(n))
                except Exception as e:  # noqa: BLE001
                    out.append(("ERROR", "xml", f"{n} is not well-formed XML: {e}"))
    return out


def run_validator(path: Path) -> list:
    """Anthropic validate.py (XSD + package rules). Output is reported verbatim."""
    script = VENDOR / "office" / "validate.py"
    r = subprocess.run([sys.executable, str(script), str(path)], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=env_utf8(), timeout=300)
    text = (r.stdout + r.stderr).strip()
    if r.returncode == 0:
        return [("OK", "xsd", text.splitlines()[-1] if text else "passed")]
    return [("ERROR", "xsd", "validate.py failed:\n" + "\n".join("      " + l for l in text.splitlines()))]


# ── docx generation rules (Anthropic docx SKILL.md, as far as they are checkable) ──

def check_docx_rules(path: Path) -> list:
    out = []
    with zipfile.ZipFile(path) as z:
        if "word/document.xml" not in z.namelist():
            return [("ERROR", "docx", "missing word/document.xml")]
        doc = fromstring(z.read("word/document.xml"))
    sect = list(doc.iter(W + "sectPr"))
    if not sect or not any(s.find(W + "pgSz") is not None for s in sect):
        out.append(("WARN", "docx-rule", "no <w:pgSz> — page size is left to the reader's default (set A4 explicitly)"))
    texts = "".join(t.text or "" for t in doc.iter(W + "t"))
    bullets = sum(texts.count(c) for c in "•●▪◦")
    if bullets:
        out.append(("WARN", "docx-rule", f"{bullets} literal bullet character(s) in text — use numbering (w:numPr) instead"))
    for shd in doc.iter(W + "shd"):
        if shd.get(W + "val") == "solid":
            out.append(("WARN", "docx-rule", "w:shd w:val=\"solid\" renders black in some viewers — use \"clear\" with w:fill"))
            break
    for ti, tbl in enumerate(doc.iter(W + "tbl")):
        tblw = tbl.find(f"{W}tblPr/{W}tblW")
        grid = [int(g.get(W + "w", 0)) for g in tbl.iter(W + "gridCol")]
        if tblw is not None and tblw.get(W + "type") != "dxa":
            out.append(("WARN", "docx-rule", f"table #{ti + 1}: tblW type={tblw.get(W + 'type')} — use dxa (pct breaks in some editors)"))
        if tblw is not None and grid and tblw.get(W + "type") == "dxa" and int(tblw.get(W + "w", 0)) != sum(grid):
            out.append(("WARN", "docx-rule", f"table #{ti + 1}: tblW={tblw.get(W + 'w')} but gridCol sum={sum(grid)}"))
        for tcw in tbl.iter(W + "tcW"):
            if tcw.get(W + "type") != "dxa":
                out.append(("WARN", "docx-rule", f"table #{ti + 1}: a cell width is type={tcw.get(W + 'type')}, not dxa"))
                break
    return out


# ── xlsx ────────────────────────────────────────────────────────────────

def check_xlsx(path: Path) -> list:
    out = []
    sys.path.insert(0, str(VENDOR))
    try:
        import recalc  # vendored; _report scans cached values without LibreOffice
    finally:
        sys.path.pop(0)
    rep = recalc._report(str(path))
    if "error" in rep:
        return [("ERROR", "xlsx", f"cannot scan workbook: {rep['error']}")]
    too_long = recalc._sheet_names_too_long(str(path))
    if too_long:
        out.append(("ERROR", "xlsx", f"sheet name(s) longer than 31 characters: {too_long}"))
    n_formulas = rep.get("total_formulas", 0)
    if rep.get("total_errors"):
        out.append(("ERROR", "formula-error", f"cached error values: {json.dumps(rep.get('error_summary'), ensure_ascii=False)}"))
    else:
        out.append(("OK", "formula-error", f"no cached error values ({n_formulas} formula(s))"))
    if not n_formulas:
        out.append(("INFO", "recalc", "skipped: no formulas"))
        return out
    soffice = find_soffice()
    if not soffice:
        out.append(("INFO", "recalc", "skipped: soffice not found"))
        return out
    with tempfile.TemporaryDirectory(prefix="office-check-") as tmp:
        copy = Path(tmp) / path.name
        shutil.copyfile(path, copy)
        r = subprocess.run([sys.executable, str(HERE / "run_recalc.py"), str(copy), "120"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace",
                           env=env_utf8(soffice), timeout=400)
    try:
        res = json.loads(r.stdout)
    except json.JSONDecodeError:
        return out + [("WARN", "recalc", f"recalc produced no JSON: {(r.stdout + r.stderr).strip()[:400]}")]
    if "error" in res:
        out.append(("WARN", "recalc", f"recalc did not run: {res['error']}"))
    elif res.get("status") == "errors_found":
        out.append(("ERROR", "recalc", f"{res['total_errors']} formula error(s) after recalculation: {json.dumps(res.get('error_summary'), ensure_ascii=False)}"))
    else:
        out.append(("OK", "recalc", f"LibreOffice recalculated {res.get('total_formulas')} formula(s), 0 errors"))
    if res.get("not_computed"):
        out.append(("WARN", "recalc", f"not computed by LibreOffice: {json.dumps(res['not_computed'], ensure_ascii=False)[:400]}"))
    return out


# ── pdf ─────────────────────────────────────────────────────────────────

def _font_embedded(font) -> bool:
    font = font.get_object()
    if font.get("/Subtype") == "/Type3":
        return True
    if font.get("/Subtype") == "/Type0":
        font = font["/DescendantFonts"][0].get_object()
    desc = font.get("/FontDescriptor")
    if desc is None:
        return False  # standard-14 font: not embedded
    desc = desc.get_object()
    return any(k in desc for k in ("/FontFile", "/FontFile2", "/FontFile3"))


def check_pdf(path: Path, rendered_from_hwpx: bool = False) -> list:
    from pypdf import PdfReader
    out = []
    try:
        reader = PdfReader(str(path))
        pages = reader.pages
        n = len(pages)
    except Exception as e:  # noqa: BLE001
        return [("ERROR", "pdf", f"cannot open: {e}")]
    if not n:
        return [("ERROR", "pdf", "0 pages")]
    texts = [(p.extract_text() or "") for p in pages]
    total = "".join(texts)
    if not total.strip():
        out.append(("ERROR", "pdf", f"{n} page(s) but no extractable text (image-only or broken font mapping)"))
    else:
        out.append(("OK", "pdf", f"{n} page(s), {len(total.strip())} characters of text"))
    blank = [i + 1 for i, t in enumerate(texts) if not t.strip()]
    if blank and total.strip():
        out.append(("WARN", "pdf", f"pages without text: {blank}"))
    unembedded = set()
    for p in pages:
        res = p.get("/Resources")
        fonts = res.get_object().get("/Font") if res is not None else None
        for name, f in (fonts.get_object().items() if fonts is not None else []):
            if not _font_embedded(f):
                unembedded.add(str(f.get_object().get("/BaseFont", name)))
    if unembedded:
        out.append(("WARN", "pdf", f"fonts not embedded: {sorted(unembedded)}"))
    fields = reader.get_fields() or {}
    if fields:
        out.append(("INFO", "pdf", f"{len(fields)} interactive form field(s) remain"))
    if rendered_from_hwpx:
        last = len(texts[-1].strip())
        if last and last < 60:
            out.append(("WARN", "layout", f"last page has only {last} characters — a heading or signature may be stranded"))
        out += hwpx_checks.text_findings(total)
    return out


# ── dispatch ────────────────────────────────────────────────────────────

def check_file(path: Path) -> list:
    ext = path.suffix.lower()
    if not path.is_file():
        return [("ERROR", "file", "not found")]
    if ext in (".docx", ".pptx"):
        out = check_zip_xml(path)
        if any(l == "ERROR" for l, *_ in out):
            return out
        out += run_validator(path)
        if ext == ".docx":
            out += check_docx_rules(path)
        return out
    if ext == ".xlsx":
        out = check_zip_xml(path)
        if any(l == "ERROR" for l, *_ in out):
            return out
        return out + check_xlsx(path)
    if ext == ".hwpx":
        out = hwpx_checks.check_hwpx(path)
        pdf = path.with_suffix(".pdf")
        if pdf.exists():
            out += [(l, f"rendered-pdf:{c}", m) for l, c, m in check_pdf(pdf, rendered_from_hwpx=True)]
        else:
            out.append(("INFO", "rendered-pdf", "skipped: no sibling .pdf (page count / blank pages need a rendered PDF)"))
        return out
    if ext == ".pdf":
        return check_pdf(path)
    return [("ERROR", "file", f"unsupported extension {ext!r}")]


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except AttributeError:
            pass
    ap = argparse.ArgumentParser(description="Validate generated office documents.")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--strict", action="store_true", help="treat WARN as failure")
    a = ap.parse_args(argv)
    errors = warns = 0
    for f in a.files:
        path = Path(f)
        print(f"== {path.name}")
        for level, code, msg in check_file(path):
            print(f"  [{level}] {code}: {msg}")
            errors += level == "ERROR"
            warns += level == "WARN"
    failed = errors or (a.strict and warns)
    print(f"\n{'FAIL' if failed else 'PASS'} — {errors} error(s), {warns} warning(s) in {len(a.files)} file(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
