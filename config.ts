// Config for PS Ticket Bot
//
// Jira credentials are pulled from env (set via `slack env add`):
//   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN

export const config = {
  projectKey: "PS",

  // Issue type used by the :on_it: reaction flow (lightweight ad-hoc tickets).
  // PS is a service desk project; available types include Support, New Feature,
  // Idea, and various Incident types. "Task" does NOT exist on PS.
  ackIssueType: "Support",

  // Issue type used by the /pi-ticket form. Must exist on the PS project.
  // If PI tickets are a dedicated issue type, name it here. Otherwise leave as Task.
  piIssueType: "Performance Investigation",

  // Transition name to move a ticket to Done
  doneTransitionName: "Done",

  // Emoji names (no colons) that trigger each action
  ackEmoji: "on_it",
  doneEmoji: "resolved",
  muteEmoji: "mute",

  // Regex to find an existing ticket key in a message body (case-insensitive)
  ticketKeyRegex: /\bPS-\d+\b/i,

  // Channels where reaction + message event triggers are active.
  // Slack event triggers must be scoped to specific channels at install time.
  channelIds: [
    "C0B4PTZEEC8", // #test-rx
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
