# PS Ticket Bot

Slack-hosted app that opens, comments on, and closes Jira PS tickets via reactions and a form.

## Flows

### Reaction-driven

| Reaction | Effect |
|---|---|
| `:ack:` on any message | Creates a `PS-###` ticket. If the message already contains a `PS-###` key, skips creation, attaches the Slack permalink to the existing issue as a remote link, and DMs an ephemeral note to the reactor. Records a thread → ticket mapping in the app datastore. |
| `:done:` on any message containing a `PS-###` key | Transitions that ticket to Done. |
| `:mute:` on any tracked thread | Pauses thread-to-Jira comment sync for that thread. |

There is **no** `reaction_removed` handler. Removing `:ack:` or `:done:` does nothing — by design, so tickets aren't accidentally opened or closed.

### Thread-to-Jira comment sync (auto)

Once a thread has a ticket tracked (via `:ack:`), every subsequent reply in that thread is posted as a comment on the Jira ticket. The comment includes the replier's display name, the message text, and the Slack permalink.

Pause with `:mute:` on the thread root.

### PI ticket form (lightning bolt)

A "File PI Ticket" entry in the ⚡ shortcuts menu next to the Slack composer opens a form with:

- Title (required)
- Description (required)
- PI Issue Type (multi-select: Performance / Pacing, required)
- Advertiser (required)
- Agency
- AID Affected
- Campaign Group ID (cgid)
- Revenue Impact / Monthly Budget (PEM fills if flagging)
- Projected Underspend (Tof/Johnny fill if flagging)
- PMO Rep (constrained dropdown, defaults to Trixy Tran)

Assignee is left blank — manual routing for now.

## One-time setup

Custom field IDs in `config.ts` are pre-filled from PS / Performance Investigation
metadata validated on 2026-05-15. Re-run `./scripts/list-fields.sh` if a Jira admin
changes the field config and you need to re-validate.

1. **Set Slack-hosted env**:
   ```bash
   slack env add JIRA_BASE_URL https://mntn.atlassian.net
   slack env add JIRA_EMAIL svc-ps-bot@mountain.com
   slack env add JIRA_API_TOKEN <token>
   ```

2. **Add channel IDs** to `config.ts → channelIds`. The reaction and message event triggers must be scoped to specific channels at install time.

3. **Deploy**:
   ```bash
   slack deploy
   ```

4. **Create triggers** (one-time per environment):
   ```bash
   slack trigger create --trigger-def triggers/ack_reaction.ts
   slack trigger create --trigger-def triggers/done_reaction.ts
   slack trigger create --trigger-def triggers/mute_reaction.ts
   slack trigger create --trigger-def triggers/message_event.ts
   slack trigger create --trigger-def triggers/pi_ticket_shortcut.ts
   ```

   When you change watched channels in `config.ts`, re-run `slack trigger update` (or delete + recreate) for the four event-scoped triggers. The shortcut trigger is not channel-scoped.

## Verify before deploying

- `Performance Investigation` issue type exists on PS (id 12823, validated 2026-05-15).
- `Task` issue type exists on PS for the `:ack:` flow. **Note**: PS is a service desk project; default issue types are `Support`, `Production Incident`, etc. `Task` may not be present — check and update `config.ackIssueType` to one of: `Support`, `New Feature`, `Idea`.
- The PS workflow has a transition literally named `Done`. The transitionIssue helper falls back to matching destination status name if the transition name doesn't match.
- The service account has Create Issue, Edit Issue, Add Comment, Transition Issue, and Add Remote Link permissions on PS.
- PMO Rep values in `config.pmoRepOptions` match the live Jira options. Re-run `./scripts/list-fields.sh` if Jira admins add/remove names.

## Local dev

```bash
slack run
```

Logs stream as reactions fire and thread replies sync.

## Files

| Path | Role |
|---|---|
| `manifest.ts` | App, scopes, workflows, functions, datastore |
| `config.ts` | Project key, emoji names, custom field IDs, watched channels |
| `datastores/thread_ticket_map.ts` | Thread → ticket mapping, mute flag |
| `triggers/ack_reaction.ts` | `:ack:` → open or link ticket |
| `triggers/done_reaction.ts` | `:done:` → transition to Done |
| `triggers/mute_reaction.ts` | `:mute:` → pause sync |
| `triggers/message_event.ts` | Thread replies → Jira comments |
| `triggers/pi_ticket_shortcut.ts` | Lightning-bolt shortcut to open the form |
| `workflows/*.ts` | One-step wrappers around each function |
| `functions/handle_ack.ts` | ACK handler |
| `functions/handle_done.ts` | DONE handler |
| `functions/mute_thread.ts` | Mute handler |
| `functions/sync_thread_comment.ts` | Thread-reply sync handler |
| `functions/create_pi_ticket.ts` | Form-submission handler (creates ticket with custom fields) |
| `functions/utils/jira.ts` | Jira REST v3 client |
| `scripts/list-fields.sh` | Discover custom field IDs |

## Known limitations

- One ticket per message for `:ack:` and `:done:`. Multiple `PS-###` keys → only first is acted on.
- Thread sync starts only after `:ack:`. Replies posted before the ticket is opened are not retroactively synced. (Easy to add: read `conversations.replies` on ACK and bulk-comment.)
- Channel-scoped event triggers only. Add channels to `config.ts` and update triggers to expand coverage.
- Form leaves assignee blank. Auto-routing (PEM ↔ Tof) is a follow-up — needs a user mapping.
