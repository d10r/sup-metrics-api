#!/bin/bash

set -eu

AIRTABLE_URL=${1-:https://airtable.com/appQN5XtEyFQHoUrJ/tblotG2tds09A9khO/viwKvH5y7GhiUvqYN?blocks=hide}
API_KEY=${AIRTABLE_API_KEY:-}

# Check if API_KEY is set
if [ -z "$API_KEY" ]; then
  echo "Error: AIRTABLE_API_KEY environment variable is not set"
  echo "Please set it with: export AIRTABLE_API_KEY=your_api_key"
  exit 1
fi

URL_PARTS=$(echo "$AIRTABLE_URL" | cut -d '?' -f 1)
BASE_AND_TABLE=$(echo "$URL_PARTS" | cut -d '/' -f 4-5)
VIEW=$(echo "$URL_PARTS" | cut -d '/' -f 6)

DL_URL="https://api.airtable.com/v0/${BASE_AND_TABLE}?view=${VIEW}"

curl -s -X GET \
  ${DL_URL} \
  -H 'Authorization: Bearer '$API_KEY \
  -H 'Content-Type: application/json' | jq > airtable.json

# mapping address: name
#cat airtable.json | jq '{} + (.records | map({(((.fields."Wallet Address " // .fields."ENS name where entered instead of wallet address (manual)")|tostring)|ascii_downcase): .fields.Name}) | add)'

# mapping address: { ens, name }
cat airtable.json | jq '{} + (.records | map({
  (((.fields."Wallet Address " // .fields."ENS name where entered instead of wallet address (manual)")|tostring)|ascii_downcase): {
    "ens": .fields."ENS name where entered instead of wallet address (manual)",
    "name": .fields.Name
  }
}) | add)' > delegates-metadata.json

