#!/bin/sh
# Generate a C string literal include file from a JS source file.
# Usage: ./gen-js-inc.sh claude-repl.js > claude-repl.js.inc
set -e
printf 'R"JS_SRC('
cat "$1"
printf ')JS_SRC"'
