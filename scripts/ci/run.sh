#!/usr/bin/env bash
# Usage: scripts/ci/run.sh "<title>" <command...>
# Runs a CI command. On failure, the last lines of its output are also published as a GitHub
# error annotation: annotations are readable without a token, job logs are not.
set -o pipefail
title="$1"
shift
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  body=$(tail -n 60 "$log" | cut -c1-220 | sed -e 's/%/%25/g' -e 's/\r//g' | awk '{printf "%s%%0A", $0}')
  echo "::error title=${title}::${body}"
fi
exit "$status"
