// Config for PS Ticket Bot
//
// Jira credentials are pulled from env (set via `slack env add`):
//   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN

export const config = {
  projectKey: "PS",

  // Issue type used by the :ack: reaction flow (lightweight ad-hoc tickets)
  ackIssueType: "Task",

  // Issue type used by the /pi-ticket form. Must exist on the PS project.
  // If PI tickets are a dedicated issue type, name it here. Otherwise leave as Task.
  piIssueType: "Performance Investigation",

  // Transition name to move a ticket to Done
  doneTransitionName: "Done",

  // Emoji names (no colons) that trigger each action
  ackEmoji: "ack",
  doneEmoji: "done",
  muteEmoji: "mute",

  // Regex to find an existing ticket key in a message body (case-insensitive)
  ticketKeyRegex: /\bPS-\d+\b/i,

  // Channels where reaction + message event triggers are active.
  // Slack event triggers must be scoped to specific channels at install time.
  channelIds: [
    // "C0XXXXXXXXX",
  ],

  // Default value placed in the PMO Rep form field
  defaultPmoRep: "Trixy",

  // Jira custom field IDs for the PI form.
  // Discover with: ./scripts/list-fields.sh   (see README)
  // Replace the customfield_XXXXX values with the real IDs from your Jira instance.
  jiraCustomFields: {
    piIssueType: "customfield_XXXXX",        // PI Issue Type (select: Performance, Pacing)
    monthlyBudget: "customfield_XXXXX",      // Revenue Impact > Monthly Budget (number)
    projectedUnderspend: "customfield_XXXXX",// Revenue Impact > Projected Underspend (number)
    advertiser: "customfield_XXXXX",         // Advertiser (text)
    agency: "customfield_XXXXX",             // Agency (text)
    aidAffected: "customfield_XXXXX",        // AID Affected (text)
    campaignGroupId: "customfield_XXXXX",    // CGID (text)
    pmoRep: "customfield_XXXXX",             // PMO Rep (text or user picker)
  },
};
