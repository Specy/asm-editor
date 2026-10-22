#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
root="$(em-config EMSCRIPTEN_ROOT)"
em++ scripts/demangle/demangle.cpp -std=c++20 -Oz -DNDEBUG \
    -I"$root/system/lib/libcxxabi/src" \
    --no-entry -s MODULARIZE=1 -s EXPORT_ES6=1 -s SINGLE_FILE=1 -s ENVIRONMENT=web,node \
    -s EXPORTED_FUNCTIONS='["_describe","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString"]' \
    -s FILESYSTEM=0 -s ALLOW_MEMORY_GROWTH=1 -s STACK_SIZE=1048576 -Wl,--stack-first \
    -o src/lib/languages/demangle/module.js
sed -i '1i// @ts-nocheck' src/lib/languages/demangle/module.js
cp "$root/system/lib/libcxxabi/LICENSE.TXT" src/lib/languages/demangle/LICENSE.txt
