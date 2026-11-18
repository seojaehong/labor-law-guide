"""Run the vendored Anthropic recalc.py without modifying it.

The upstream helper probes socket.AF_UNIX to decide whether LibreOffice needs an
LD_PRELOAD shim. On Windows that attribute does not exist, so the probe raises
AttributeError and recalc aborts. No shim is needed there, so we patch the probe
in-process and then hand control to the unmodified upstream main().

Usage: python run_recalc.py <workbook.xlsx> [timeout_seconds]
"""
import socket
import sys
from pathlib import Path

VENDOR = Path(__file__).resolve().parents[2] / "third_party" / "anthropic-skills" / "scripts"
sys.path.insert(0, str(VENDOR))

import office.soffice as soffice  # noqa: E402

if not hasattr(socket, "AF_UNIX"):
    soffice._needs_shim = lambda: False

import recalc  # noqa: E402

if __name__ == "__main__":
    recalc.main()
