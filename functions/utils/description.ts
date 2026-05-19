// Build a clean Jira ADF description for a ticket sourced from a Slack message.
//
// Resolves the reactor's display name, strips Slack markup from the body,
// and turns the permalink into a clickable link rather than a raw URL.

export interface BuildDescriptionArgs {
  reactorDisplayName: string;   // e.g. "Bryce Wagg" — caller resolves via users.info
  permalink: string;             // Slack permalink URL
  originalText: string;          // Raw Slack message body
  channelName?: string;          // Optional, makes the link label friendlier
}

function cleanBodyText(s: string): string {
  return s
    // <url|text> -> text
    .replace(/<((?:https?:\/\/|mailto:)[^|>]+)\|([^>]+)>/g, "$2")
    // <@USERID> stays (would need a lookup to resolve); turn into @USERID so it's readable
    .replace(/<@(U[A-Z0-9]+)>/g, "@$1")
    // <#CHANNELID|name> -> #name
    .replace(/<#C[A-Z0-9]+\|([^>]+)>/g, "#$1")
    // <!subteam^...|name> -> @name
    .replace(/<![a-z]+(?:\^[A-Z0-9]+)?(?:\|([^>]+))?>/g, (_m, n) => (n ? `@${n}` : ""))
    // <url> -> url (plain)
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, "$1")
    // Strip emphasis markup
    .replace(/[*_~`]/g, "")
    // Tidy whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Build the ADF body. Returned object is the value of the `description` field. */
export function buildSlackSourcedDescription(args: BuildDescriptionArgs) {
  const cleaned = cleanBodyText(args.originalText);
  const linkLabel = args.channelName ? `View in #${args.channelName}` : "View in Slack";

  // Header paragraph: who + clickable link
  const headerContent: unknown[] = [
    { type: "text", text: "Opened from Slack by " },
    { type: "text", text: args.reactorDisplayName, marks: [{ type: "strong" }] },
    { type: "text", text: ". " },
    {
      type: "text",
      text: linkLabel,
      marks: [{ type: "link", attrs: { href: args.permalink } }],
    },
    { type: "text", text: "." },
  ];

  const content: unknown[] = [
    { type: "paragraph", content: headerContent },
    { type: "rule" },
  ];

  if (cleaned) {
    // Each line becomes its own paragraph for readability.
    const paragraphs = cleaned.split(/\n+/).filter((l) => l.trim().length > 0);
    for (const p of paragraphs) {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: p }],
      });
    }
  }

  return { type: "doc", version: 1, content };
}
