#!/bin/sh
set -eu
# Entire acceptance lifecycle uses the real shared Runtime/Goose/policy and an
# offline ModelTransport fixture; it performs no model/network calls.
cd "$(dirname "$0")/.."
cargo test --test smoke -- --nocapture
