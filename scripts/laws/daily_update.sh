#!/usr/bin/env bash
# /laws 노동법 개정 알림 — 매일 수집. 서버1(국내) cron 에서 돈다.
#
# 왜 GitHub Actions 가 아닌가: 법제처 DRF 가 해외 IP(GitHub 러너)에서 첫 호출부터 시간 초과다
# (2026-10-05 실측, run 37246117884). 서버1·서버2(국내)는 200.
#
# 하는 일: master 최신본에서 수집 → 실제로 바뀐 개정(이벤트·변경 조문 수·제목 유무)이 있으면
# 고정 브랜치 bot/law-revisions 로 PR 을 연다(이미 열려 있으면 본문만 갱신).
# master 에 바로 넣지 않는다 — 날짜별 제목(headlines.json)·취업규칙 매핑(work_rules_map.json)은
# 사람이 바뀐 조문 원문을 보고 쓴다.
#
#   crontab: 30 6 * * *  cd <repo> && bash scripts/laws/daily_update.sh >> ~/logs/law-revisions.log 2>&1
#   (서버 시계가 UTC 면 30 21 * * *)
#   DRY_RUN=1 bash scripts/laws/daily_update.sh   # 수집·비교만, 브랜치·PR 안 만듦
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
BRANCH=bot/law-revisions
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
day=$(TZ=Asia/Seoul date +%Y-%m-%d)
echo "== $day law-revisions"

if [ -n "$(git status --porcelain)" ]; then
  echo "작업 트리가 깨끗하지 않다 — 손대지 않고 멈춘다"; git status --short; exit 1
fi
start=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin master
git checkout -q --detach origin/master

python3 scripts/laws/fingerprint.py > "$TMP/before.txt"
# 시작일은 커밋된 데이터의 since 를 그대로 쓴다. 스크립트 기본값(오늘−365일)은 매일 밀려
# 「목록에서 빠진 개정」이 날마다 생긴다(2026-10-05 서버1 시험 — 168건이 146건으로 줄었다)
python3 scripts/laws/fetch_law_revisions.py --since "${LAW_SINCE:-$(python3 -c 'import json;print(json.load(open("data/law-revisions.json",encoding="utf-8"))["since"])')}"
python3 scripts/laws/diff_law_versions.py
python3 scripts/laws/build_site_data.py
python3 scripts/laws/fingerprint.py --compare "$TMP/before.txt" > "$TMP/changes.md"

if [ ! -s "$TMP/changes.md" ]; then
  echo "바뀐 개정 없음"
  git checkout -q -- . && git clean -fdq -- data/law-diffs public/data/laws && git checkout -q "$start"
  exit 0
fi
cat "$TMP/changes.md"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN — 브랜치·PR 안 만듦"
  git checkout -q -- . && git clean -fdq -- data/law-diffs public/data/laws && git checkout -q "$start"
  exit 0
fi

git checkout -q -B "$BRANCH"
git add data/law-revisions.json data/law-diffs public/data/laws
git commit -q -m "chore(laws): 법령 개정 자동 수집 $day"
git push -q -f origin "$BRANCH"
{
  echo "법제처 Open API 매일 수집(서버1)에서 바뀐 개정이 잡혔다."
  echo
  cat "$TMP/changes.md"
  echo "### 병합 전에 사람이 할 것"
  echo "- 제목이 **없음**인 개정은 바뀐 조문 원문을 보고 \`scripts/laws/headlines.json\` 에 한 줄 제목을 쓴다"
  echo "- 취업규칙에 걸리는 개정이면 \`scripts/laws/work_rules_map.json\` 에 매핑을 더한다(/노동법개정반영)"
  echo "- 하위법령(시행령·시행규칙)이 새로 공포됐으면 그 법률 매핑의 「시행령 공포 후 확정」 문안을 다시 본다"
  echo "- 위를 고친 뒤 \`python3 scripts/laws/build_site_data.py\` 를 다시 돌려 커밋한다"
} > "$TMP/body.md"
if gh pr view "$BRANCH" --json state -q .state 2>/dev/null | grep -q OPEN; then
  gh pr edit "$BRANCH" --body-file "$TMP/body.md"
else
  gh pr create --base master --head "$BRANCH" --title "chore(laws): 법령 개정 자동 수집 $day" --body-file "$TMP/body.md"
fi
git checkout -q "$start"
