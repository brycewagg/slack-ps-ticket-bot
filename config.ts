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

  // Issue type used by the /pi-ticket form. Must exist on the PS project.
  // If PI tickets are a dedicated issue type, name it here. Otherwise leave as Task.
  piIssueType: "Performance Investigation",

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
  ],

  // Default PMO Rep. Must match a value from pmoRepOptions exactly.
  defaultPmoRep: "Trixy Tran",

  // Jira custom field IDs for the PI form, validated against PS / Performance Investigation
  // issue type on 2026-05-15.
  jiraCustomFields: {
    piIssueType: "customfield_19899",        // multi-select: Performance, Pacing
    revenueImpact: "customfield_15553",      // text (Jira field name: "Revenue Impact")
    projectedUnderspend: "customfield_19901",// text
    advertiser: "customfield_19934",         // text
    agency: "customfield_19935",             // text
    aidAffected: "customfield_13720",        // text
    campaignGroupId: "customfield_15631",    // text
    pmoRep: "customfield_15612",             // single-select, value must match below
  },

  // Allowed PMO Rep values, as defined in Jira (customfield_15612).
  // Update if Jira admins change the list.
  pmoRepOptions: [
    "Al Beretta",
    "Amanda Miles",
    "Angela Pace",
    "Bryce Wagg",
    "Casey Bond",
    "Daniella Kubiak",
    "Elena Donnelly",
    "Helen Barden",
    "Jen Wang",
    "Jason Huertas",
    "Jessica Crist",
    "Kaila Griep",
    "Kaitlin Dickinson",
    "Luis Chelala",
    "Meghan Besse",
    "Michelle Cervantes",
    "Michelle Helms",
    "Mike Dolzer",
    "Paul Reitzin",
    "Shauna Stannard",
    "Tasha Schaffels",
    "Tejas Widjonarko",
    "Tim Harrison",
    "Trixy Tran",
  ],
};
