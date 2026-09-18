#!/usr/bin/env bash
# Commit whatever the probe produced and push it back to the session branch so
# the agent can read it (GitHub Actions logs are not reachable from the sandbox).
set -uo pipefail
BRANCH="${BRANCH:-arena/01a0b25d-open-world-game}"
OUT_DIR="${OUT_DIR:-probe}"

git config user.name "probe-bot"
git config user.email "probe-bot@users.noreply.github.com"

mkdir -p "$OUT_DIR"
{
  echo "run: $GITHUB_RUN_ID  $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
  echo "date: $(date -u)"
  echo "files:"
  ls -la "$OUT_DIR"
} > "$OUT_DIR/publish.txt"

# Never let big payloads into git history: keep the blend out, cap file sizes.
find "$OUT_DIR" -type f -size +8M -print -delete

git add -f "$OUT_DIR"
if git diff --cached --quiet; then
  echo "nothing to publish"
  exit 0
fi
git commit -q -m "probe: run $GITHUB_RUN_ID results" || true

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
