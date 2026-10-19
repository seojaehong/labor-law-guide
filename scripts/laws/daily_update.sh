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

# 🔴 2026-10-13 — cron 의 PATH 는 /usr/bin:/bin 뿐이라 `gh` 를 못 찾았다.
# gh 는 서버1에 **설치돼 있고 인증도 돼 있다**(~/.local/bin/gh, seojaehong).
# 「gh 가 없다」가 아니라 **cron 이 그 경로를 안 본다**가 원인이었다.
# 그 결과 line 69 에서 127 로 죽고, `set -e` 때문에 마지막 `git checkout "$start"` 가
# 실행되지 않아 레포가 bot/law-revisions 에 남았다(실측). 수집은 성공했는데 PR 만 안 열렸다.
export PATH="$HOME/.local/bin:$HOME/bin:/usr/local/bin:$PATH"

# 그래도 못 찾으면 **조용히 죽지 않는다.** 아무도 모른 채 브랜치에만 쌓이던 게 이번 사고다.
notify() {
  local msg="$1"
  echo "$msg"
  local env1=/home/ubuntu/work-orchestrator/.env
  [ -f "$env1" ] || return 0
  local tok chat
  tok=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' "$env1" | cut -d= -f2-)
  chat=$(grep -m1 '^TELEGRAM_CHAT_ID=' "$env1" | cut -d= -f2-)
  [ -n "$tok" ] || return 0
  curl -s -m 20 -X POST "https://api.telegram.org/bot${tok}/sendMessage" \
    -H 'Content-Type: application/json' \
    --data-raw "$(python3 -c 'import json,sys;print(json.dumps({"chat_id":sys.argv[1] or "8699916672","text":sys.argv[2]}))' "$chat" "$msg")" >/dev/null || true
}

if ! command -v gh >/dev/null 2>&1; then
  notify "🔴 /laws 매일 수집 — gh 를 찾지 못해 PR 을 열지 못했습니다.
수집 자체는 돌았고 브랜치(bot/law-revisions)에만 쌓입니다.
PATH=$PATH
고치는 법: gh 경로를 확인해 이 스크립트 상단 PATH 에 더하세요."
  exit 1
fi

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

# 🔴 재생성이 **조용히 줄이는 것**을 막는다 (2026-10-19).
#   2026-10-13 에 가족돌봄 anchor 가 생성물 rules.json 에만 들어가고 원본
#   work_rules_map.json 에는 안 들어갔다. 10-18 수집이 재생성하면서 지웠고(10→9)
#   아무 알림도 없었다. 운영에 안 나간 것은 우연이었다.
#   줄었으면 **PR 을 열지 않고 멈춘다.** 늘거나 같으면 그대로 간다.
guard_rc=0
python3 scripts/laws/guard_no_shrink.py origin/master > "$TMP/guard.txt" 2>&1 || guard_rc=$?
cat "$TMP/guard.txt"
if [ "$guard_rc" = "2" ]; then
  notify "🔴 /laws 매일 수집 — **재생성이 규칙을 줄여서 멈췄습니다.**
$(cat "$TMP/guard.txt")

생성물(public/data/laws)을 직접 고치고 원본(scripts/laws/work_rules_map.json)에
안 넣으면 이렇게 됩니다. 원본을 고치고 다시 돌리면 풀립니다. PR 은 열지 않았습니다."
  git checkout -q -- . && git clean -fdq -- data/law-diffs public/data/laws && git checkout -q "$start"
  exit 3
fi

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
# PR 단계가 실패해도 **원래 브랜치로는 반드시 돌아온다.**
# 종전에는 여기서 죽으면 레포가 bot/law-revisions 에 남아, 다음 사람이 그 위에서 작업했다.
pr_rc=0
if gh pr view "$BRANCH" --json state -q .state 2>/dev/null | grep -q OPEN; then
  gh pr edit "$BRANCH" --body-file "$TMP/body.md" || pr_rc=$?
else
  gh pr create --base master --head "$BRANCH" --title "chore(laws): 법령 개정 자동 수집 $day" --body-file "$TMP/body.md" || pr_rc=$?
fi
git checkout -q "$start"
if [ "$pr_rc" -ne 0 ]; then
  notify "🔴 /laws 매일 수집 — 수집은 됐는데 PR 열기/갱신이 실패했습니다(gh 종료코드 $pr_rc).
브랜치 $BRANCH 는 푸시돼 있으니 수집분은 남아 있습니다."
  exit "$pr_rc"
fi
