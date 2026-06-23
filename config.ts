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

  // Default terminal transition for ticket types that don't have an override.
  // Support tickets and most other PS types use "Resolved" (id 781).
  doneTransitionName: "Resolved",

  // Per-issue-type override. PI tickets have a literal "Done" transition
  // (id 1111) so :resolved: routes them to Done instead of Resolved.
  doneTransitionByIssueTypeId: {
    "12823": "Done", // Performance Investigation
  } as Record<string, string>,

  // Emoji names (no colons) that trigger each action
  ackEmoji: "on_it",
  doneEmoji: "resolved",
  muteEmoji: "mute",

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
    piIssueType: "customfield_19899",        // multi-select: Performance, Pacing
    revenueImpact: "customfield_15553",      // text (Jira field name: "Revenue Impact")
    projectedUnderspend: "customfield_19901",// text
    advertiser: "customfield_19934",         // text
    agency: "customfield_19935",             // text
    aidAffected: "customfield_13720",        // text
    campaignGroupId: "customfield_15631",    // text
  },
};
