#!/usr/bin/env bash
# Discover Jira custom field IDs for the PI form.
# Run after exporting JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in your shell.
#
# Output: id + name for every field whose name matches the PI form fields,
# so you can copy the customfield_XXXXX values into config.ts.

set -euo pipefail

: "${JIRA_BASE_URL:?must be set}"
: "${JIRA_EMAIL:?must be set}"
: "${JIRA_API_TOKEN:?must be set}"

curl -s -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  "${JIRA_BASE_URL}/rest/api/3/field" \
  | jq '
      map(select(.name | test(
        "PI Issue Type|Monthly Budget|Projected Underspend|Advertiser|Agency|AID|Campaign Group|PMO Rep|Revenue Impact";
        "i"
      )))
      | map({id, name})
    '
