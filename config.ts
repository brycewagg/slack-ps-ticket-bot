// Config for PS Ticket Bot
//
// Jira credentials are pulled from env (set via `slack env add`):
//   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN

export const config = {
  projectKey: "PS",

  // Issue type used by the :on_it: reaction flow (lightweight ad-hoc tickets).
  // Sent by ID (more reliable than name on service-desk projects).
  // PS issue type IDs: Support=11222, New Feature=11221, Idea=11391,
  //                    Performance Investigation=12823
  ackIssueTypeId: "11222",

  // Per-channel override for the non-PI fallback. #daily-customer-performance
  // is a PI-only channel, so tickets raised there stay Performance
  // Investigation even when the message format defeats the PI parser
  // (PS-8486, 2026-07-16). Test channels keep the Support fallback.
  ackIssueTypeIdByChannel: {
    "C05P7BAN370": "12823", // #daily-customer-performance
  } as Record<string, string>,

  // Default terminal transition for ticket types that don't have an override.
  // Support tickets and most other PS types use "Resolved" (id 781).
  doneTransitionName: "Resolved",

  // Per-issue-type override. PI tickets have a literal "Done" transition
  // (id 1111) so :resolved: routes them to Done instead of Resolved.
  doneTransitionByIssueTypeId: {
    "12823": "Done", // Performance Investigation
  } as Record<string, string>,

  // Emoji names (no colons) that trigger each action.
  // ackEmojis: any of these opens/links a ticket. :white_check_mark: was added
  // 2026-07-28 per Jen (Tof finds it easier to reach than :on_it:).
  // ackEmoji stays the canonical one used in user-facing copy.
  ackEmoji: "on_it",
  ackEmojis: ["on_it", "white_check_mark"],
  doneEmoji: "resolved",
  muteEmoji: "mute",

  // :eyes: route — Data Monitoring (DM) "Analysis" tickets for Pratik's team.
  // Added 2026-11-19 per Jen (jwang). Deliberately separate from the PS ack
  // flow: different project + issue type, auto-assigned, and NO thread-sync.
  // The ticket captures the triggering message as the issue ("main issue
  // points"); it does NOT record a thread mapping, so replies are not mirrored
  // into Jira comments (Jen: "No need for all the slack threads to be in JIRA
  // comments"). Model ticket: DM-4518 (Analysis, assigned to Pratik).
  analysisEmoji: "eyes",
  analysisRoute: {
    projectKey: "DM", // Data Monitoring (project id 16338)
    issueTypeId: "10700", // "Analysis" (verified via createmeta 2026-11-19)
    // Pratik Panchigar (pratik@mountain.com). Hardcoded accountId is more
    // reliable than a name/email lookup for the auto-assign requirement.
    assigneeAccountId: "61b6d3ff599f18006a256aef",
    // Existing DM key in the message body → link instead of creating a dupe.
    ticketKeyRegex: /\bDM-\d+\b/i,
  },

  // Regex to find an existing ticket key in a message body (case-insensitive)
  ticketKeyRegex: /\bPS-\d+\b/i,

  // Channels where reaction + message event triggers are active.
  // Slack event triggers must be scoped to specific channels at install time.
  channelIds: [
    "C0B4PTZEEC8", // #test-rx (sandbox)
    "C0B1JSHRZSL", // #test-daily-customer-perf (broader team testing)
    "C05P7BAN370", // #daily-customer-performance (production rollout)
  ],

  // Jira custom field IDs set by the :on_it: flow when it detects a PI alert,
  // validated against PS / Performance Investigation issue type on 2026-05-15.
  jiraCustomFields: {
    piIssueType: "customfield_19899", // multi-select: Performance, Pacing
    revenueImpact: "customfield_15553", // text (Jira field name: "Revenue Impact")
    projectedUnderspend: "customfield_19901", // text
    advertiser: "customfield_19934", // text
    agency: "customfield_19935", // text
    aidAffected: "customfield_13720", // text
    campaignGroupId: "customfield_15631", // text
  },
};
