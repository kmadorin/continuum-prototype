#!/usr/bin/env bash
# End-to-end: close the canonical Continuum deal on a live Canton sandbox and
# assert the §5 conservation identities. Requires dpm (SDK 3.4.11) + JDK 17.
set -euo pipefail
cd "$(dirname "$0")/.."

dpm build --all
SCRIPTS="scripts/.daml/dist/continuum-scripts-1.0.0.dar"
PORT=6865

# Start the Canton sandbox (ledger API on 6865 gRPC). Kill it on exit.
dpm sandbox > /tmp/continuum-sandbox.log 2>&1 &
SANDBOX_PID=$!
trap 'kill $SANDBOX_PID 2>/dev/null || true' EXIT

# Readiness: wait until the sandbox accepts a trivial script (also uploads the DAR).
echo "waiting for sandbox on :$PORT ..."
until dpm script --ledger-host localhost --ledger-port "$PORT" \
        --dar "$SCRIPTS" --script-name Continuum.Scenario:ping --upload-dar true \
        >/dev/null 2>&1; do
  sleep 2
done

# Run the full deal close + conservation assertions against the live ledger.
dpm script --ledger-host localhost --ledger-port "$PORT" \
  --dar "$SCRIPTS" --script-name Continuum.Scenario:setupCloseAndAssert

echo "E2E OK: deal closed and conservation asserted on a live Canton sandbox"
