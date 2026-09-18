#!/usr/bin/env bash
# Push screenshot results back to the session branch so the agent can read them
# (GitHub Actions logs and artifacts are not reachable from the sandbox).
set -uo pipefail
BRANCH="${BRANCH:-arena/01a0b25d-open-world-game}"
OUT_DIR="${OUT_DIR:-probe/shots}"

git config user.name "shots-bot"
git config user.email "shots-bot@users.noreply.github.com"

mkdir -p "$OUT_DIR"
{
  echo "run: $GITHUB_RUN_ID  $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
  echo "date: $(date -u)"
  echo "commit: $GITHUB_SHA"
  ls -la "$OUT_DIR"
} > "$OUT_DIR/publish.txt"
find "$OUT_DIR" -type f -size +6M -print -delete

git add -f "$OUT_DIR"
if git diff --cached --quiet; then
  echo "nothing to publish"
  exit 0
fi
git commit -q -m "shots: run $GITHUB_RUN_ID" || true
for i in 1 2 3; do
  git pull --rebase --autostash origin "$BRANCH" >/dev/null 2>&1 || true
  if git push origin "HEAD:$BRANCH"; then
    echo "published to $BRANCH"
    exit 0
  fi
  sleep 5
done
echo "PUSH FAILED"
exit 1
