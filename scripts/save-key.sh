#!/bin/sh
# Saves a key in the macOS Keychain without showing it on screen:
#   sh scripts/save-key.sh supabase-toxoff-openai
# (security's own -w prompt silently keeps only the first 128 characters, too few for OpenAI keys.)
name="$1"
if [ -z "$name" ]; then
  echo "Usage: sh scripts/save-key.sh <keychain name>, e.g. supabase-toxoff-openai"
  exit 1
fi

trap 'stty echo 2>/dev/null' EXIT INT TERM
key=""
while [ -z "$key" ]; do
  printf 'Paste the key for %s, then press Enter: ' "$name"
  stty -echo
  IFS= read -r key
  stty echo
  echo
  key=$(printf '%s' "$key" | tr -d '[:space:]')
  [ -n "$key" ] || echo "Nothing was pasted. Try again (Ctrl-C to stop)."
done

security add-generic-password -U -a toxoff -s "$name" -w "$key" &&
  echo "Saved $name: ${#key} characters, ending in ...$(printf '%s' "$key" | tail -c 4)"
