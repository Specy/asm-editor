#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
em++ scripts/demangle/demangle.cpp -Oz --no-entry -s MODULARIZE=1 -s EXPORT_ES6=1 -s SINGLE_FILE=1 -s ENVIRONMENT=web,node -s EXPORTED_FUNCTIONS='["_demangle","_free"]' -s EXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString"]' -s FILESYSTEM=0 -s ALLOW_MEMORY_GROWTH=1 -o src/lib/languages/demangle/module.js
sed -i '1i// @ts-nocheck' src/lib/languages/demangle/module.js
cp "$(em-config EMSCRIPTEN_ROOT)/system/lib/libcxxabi/LICENSE.TXT" src/lib/languages/demangle/LICENSE.txt
