// Parse a Slack PI alert message into structured fields.
//
// Source messages look like (with bold/italic markup that Slack accepts):
//   *Advertiser: Monnick (61694)*
//   *Campaign: Marlborough- April - June (118715)*
//   *Projected Underspend: $13,675 (91%)*
//
// The parser is permissive: it strips common Slack formatting, matches
// case-insensitively, and treats every field as optional. If a recognizable
// PI signal (advertiser/campaign/underspend) is found, isPiAlert is true.

export interface ParsedPi {
  isPiAlert: boolean;
  advertiser?: string;        // Just the name, e.g. "Monnick"
  aidAffected?: string;       // Numeric ID parsed from "(NNNN)" after Advertiser
  campaignName?: string;      // Used for the Jira summary if no other summary line wins
  campaignGroupId?: string;   // cgid; numeric ID after Campaign
  agency?: string;
  monthlyBudget?: string;     // Maps to Revenue Impact field
  projectedUnderspend?: string;
  piIssueType?: "Performance" | "Pacing";
}

function stripSlackMarkup(s: string): string {
  // Strip *bold*, _italic_, ~strike~, `code`, and inline link wrappers <url|text>.
  return s
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2") // <url|text> -> text
    .replace(/<([^>]+)>/g, "$1")            // <url> -> url
    .replace(/[*_~`]/g, "")
    .trim();
}

function firstMatch(text: string, re: RegExp): RegExpMatchArray | null {
  for (const line of text.split(/\r?\n/)) {
    const cleaned = stripSlackMarkup(line);
    const m = cleaned.match(re);
    if (m) return m;
  }
  // Also try the joined text in case fields are on one line
  const joined = stripSlackMarkup(text.replace(/\r?\n/g, " "));
  return joined.match(re);
}

export function parsePi(rawText: string): ParsedPi {
  const result: ParsedPi = { isPiAlert: false };

  // Advertiser: <name> (<id>?)
  const adv = firstMatch(
    rawText,
    /\bAdvertiser\s*:\s*([^()\n]+?)\s*(?:\((\d+)\))?\s*$/im,
  );
  if (adv) {
    result.advertiser = adv[1].trim();
    if (adv[2]) result.aidAffected = adv[2].trim();
  }

  // Campaign: <name> (<cgid>?)
  const camp = firstMatch(
    rawText,
    /\bCampaign\s*:\s*([^()\n]+?)\s*(?:\((\d+)\))?\s*$/im,
  );
  if (camp) {
    result.campaignName = camp[1].trim();
    if (camp[2]) result.campaignGroupId = camp[2].trim();
  }

  // Projected Underspend: $<amount> (<percent>%)?
  const pu = firstMatch(
    rawText,
    /\bProjected\s+Underspend\s*:\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?%?)\))?/im,
  );
  if (pu) {
    result.projectedUnderspend = pu[2] ? `$${pu[1]} (${pu[2]})` : `$${pu[1]}`;
  }

  // Monthly Budget: $<amount>  (maps to Revenue Impact)
  const mb = firstMatch(
    rawText,
    /\b(?:Monthly\s+Budget|Revenue\s+Impact)\s*:\s*\$?\s*([\d,]+(?:\.\d+)?)/im,
  );
  if (mb) {
    result.monthlyBudget = `$${mb[1]}`;
  }

  // Agency: <name>
  const ag = firstMatch(rawText, /\bAgency\s*:\s*([^\n]+?)\s*$/im);
  if (ag) result.agency = ag[1].trim();

  // PI Issue Type heuristic
  const lower = rawText.toLowerCase();
  if (/\b(pacing|underspend)\b/.test(lower)) {
    result.piIssueType = "Pacing";
  } else if (/\bperformance\b/.test(lower)) {
    result.piIssueType = "Performance";
  }

  // Treat as a PI alert if any of the strong signals matched
  result.isPiAlert = !!(
    result.advertiser ||
    result.projectedUnderspend ||
    result.monthlyBudget ||
    result.campaignGroupId
  );

  return result;
}
