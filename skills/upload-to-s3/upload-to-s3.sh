#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: upload-to-s3.sh <file>" >&2
  exit 1
fi

file="$1"
if [ ! -f "$file" ]; then
  echo "error: not a file: $file" >&2
  exit 1
fi

for var in S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "error: $var is not set" >&2
    exit 1
  fi
done

name="$(basename "$file")"
ext="${name##*.}"
if [ "$ext" = "$name" ] || [ -z "$ext" ]; then
  ext="$(file --extension -b "$file" | cut -d/ -f1 | cut -d, -f1)"
fi
if [ -z "$ext" ] || [ "$ext" = "???" ]; then
  ext="bin"
fi
ext="$(printf '%s' "${ext,,}" | tr -cd 'a-z0-9')"
[ -n "$ext" ] || ext="bin"

key="$(node -e 'process.stdout.write(crypto.randomUUID())').$ext"
mime="$(file --mime-type -b "$file")"
url="${S3_ENDPOINT%/}/${S3_BUCKET}/$key"

echo "uploading $file -> $url" >&2
curl --fail --silent --show-error \
  --aws-sigv4 "aws:amz:${S3_REGION:-us-east-1}:s3" \
  --user "${S3_ACCESS_KEY_ID}:${S3_SECRET_ACCESS_KEY}" \
  -H "Content-Type: $mime" \
  -T "$file" \
  "$url"

if [ -n "${TMUX:-}" ] && printf '%s' "$url" | tmux load-buffer -w - 2>/dev/null; then
  :
elif printf '\033]52;c;%s\a' "$(printf '%s' "$url" | base64 | tr -d '\n')" > /dev/tty 2>/dev/null; then
  :
else
  echo "warning: could not reach the clipboard; copy the URL manually" >&2
fi

printf '%s\n' "$url"
