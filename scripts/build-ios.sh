#!/bin/sh
# Production iOS build (and, with "submit", upload to TestFlight) using the team's App Store Connect
# API key, so no Apple ID login is needed. Run in your own Terminal:
#   sh ~/toxoff/scripts/build-ios.sh            # build
#   sh ~/toxoff/scripts/build-ios.sh submit     # send the latest build to TestFlight
#   sh ~/toxoff/scripts/build-ios.sh credentials  # manage signing / upload the push key
# The key file stays outside the repo; nothing here is secret (ids only).
set -e
cd "$(dirname "$0")/.."
export EXPO_ASC_API_KEY_PATH="$HOME/toxoff-secrets/AuthKey_NF6T7YKRPX.p8"
export EXPO_ASC_KEY_ID=NF6T7YKRPX
export EXPO_ASC_ISSUER_ID=eea90b83-a6ed-4296-bb34-74c580e127a8
export EXPO_APPLE_TEAM_ID=74L3KZ3QJA
export EXPO_APPLE_TEAM_TYPE=INDIVIDUAL
[ -f "$EXPO_ASC_API_KEY_PATH" ] || { echo "Key file not found: $EXPO_ASC_API_KEY_PATH"; exit 1; }
if [ "$1" = "credentials" ]; then
  exec npx eas-cli credentials --platform ios
fi
if [ "$1" = "submit" ]; then
  exec npx eas-cli submit --platform ios --profile production --latest
fi
exec npx eas-cli build --platform ios --profile production
