#!/bin/sh
set -eu
# Compatibility entry point inside the disposable container; prepare the suite first.
exec node /work/test/integration/run_suite.cjs "${1:-/suite}"
