"""법제처 DRF 이용자 ID(OC) — 코드에 기본값을 두지 않는다(공개 저장소).

순서: env LAW_GO_KR_OC → env LAW_OC → ~/.claude/.env 의 LAW_OC= 줄. 셋 다 없으면 멈춘다.
tools/k-labor/lib/law-drf.mjs 와 같은 순서다. 서버1 cron 은 daily_update.sh 가 env 파일에서 넣어 준다.
"""
import os
import sys
from pathlib import Path


def law_oc() -> str:
    for name in ("LAW_GO_KR_OC", "LAW_OC"):
        v = os.environ.get(name, "").strip()
        if v:
            return v
    env = Path.home() / ".claude" / ".env"
    if env.is_file():
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and key.strip() == "LAW_OC" and value.strip():
                return value.strip().strip("'\"")
    sys.exit("법제처 OC 가 없습니다 — env LAW_GO_KR_OC 또는 LAW_OC 를 넣어 주세요(open.law.go.kr 이용자 ID).")
