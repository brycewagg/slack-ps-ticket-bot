// Parse a Slack PI alert message into structured fields.
//
// Messages come from #daily-customer-performance in many shapes. The parser
// tries multiple labels for each field, falling back gracefully if any pass
// misses. Real example shapes covered:
//
//   "Advertiser: Monnick (61694)"
//   "Advertiser Name: GLD 40586"
//   "Advertiser Name: Winnebago Outdoors (AID 43409)"
//   "Account: The Republic of Tea" + separate "AID: 34496"
//   "Brand: Station Casinos - 59584"
//   "Campaign Impacted: SSE Retail Promo RETARGETING"
//   "Campaign \"Prosp Medical 05-26\""
//   "Monthly budget and/or potential amount of revenue loss: $125k"
//   "Issue: Underpacing"
//
// If the message is a PI alert (any strong PI signal found), isPiAlert is true.

export interface ParsedPi {
  isPiAlert: boolean;
  advertiser?: string;
  aidAffected?: string;
  campaignName?: string;
  campaignGroupId?: string;
  agency?: string;
  monthlyBudget?: string;
  projectedUnderspend?: string;
  piIssueType?: "Performance" | "Pacing";
}

function stripSlackMarkup(s: string): string {
  return s
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/[*_~`]/g, "")
    .trim();
}

function cleanLines(rawText: string): string[] {
  return rawText.split(/\r?\n/).map((l) => stripSlackMarkup(l)).filter((l) => l.length > 0);
}

function firstLineMatch(lines: string[], re: RegExp): RegExpMatchArray | null {
  for (const line of lines) {
    const m = line.match(re);
    if (m) return m;
  }
  return null;
}

// Strip trailing AID/parenthesized IDs from a name capture
function cleanName(s: string): string {
  return s
    .replace(/\s*\((?:AID\s+)?\d+\)\s*$/i, "")
    .replace(/\s*-\s*\d+\s*$/, "")
    .replace(/\s*\bAID\s+\d+\s*$/i, "")
    .replace(/\s+\d+\s*$/, "")
    .trim();
}

export function parsePi(rawText: string): ParsedPi {
  const result: ParsedPi = { isPiAlert: false };
  const lines = cleanLines(rawText);
  const allText = lines.join("\n");

  // ---- Advertiser name + AID ---------------------------------------------
  // Try multiple labels: Advertiser, Advertiser Name, Brand, Account.
  // A parenthetical may sit between the label and the colon: "Account (AID):".
  // The regex captures the name and an optional trailing ID in (), () with AID prefix, or after a hyphen.
  const advLabels = /\b(?:Advertiser(?:\s+Name)?|Brand|Account)(?:\s*\([^)]*\))?\s*:\s*(.+?)\s*$/im;
  const advMatch = firstLineMatch(lines, advLabels);
  if (advMatch) {
    const tail = advMatch[1].trim();
    result.advertiser = cleanName(tail);
    // Try to pull an AID from the same line
    const idInLine =
      tail.match(/\((?:AID\s+)?(\d+)\)/i) ||
      tail.match(/[-–]\s*(\d+)\s*$/) ||
      tail.match(/\bAID\s+(\d+)/i) ||
      tail.match(/\s+(\d{4,})\s*$/); // bare trailing number 4+ digits
    if (idInLine) result.aidAffected = idInLine[1];
  }

  // Standalone AID lines (when not captured above)
  if (!result.aidAffected) {
    const aid = firstLineMatch(lines, /\bAID(?:\s+Affected)?\s*:?\s*(\d+)/i);
    if (aid) result.aidAffected = aid[1];
  }

  // ---- Campaign name + CGID ----------------------------------------------
  // "Campaign:", "Campaign Impacted:", "Campaign Name:", "Impacted Campaign(s):",
  // "Campaigns:". Also handles quoted campaign names: Campaign "X".
  // When the label line carries no value (e.g. "Impacted Campaign(s):" with the
  // name on the next sub-bullet), fall through to the following line.
  const campLabels = /\b(?:Impacted\s+)?Campaigns?(?:\(s\))?(?:\s+(?:Impacted|Name))?\s*:?\s*(.*)$/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(campLabels);
    if (!m) continue;
    let camp = m[1].trim();
    // Strip surrounding quotes
    camp = camp.replace(/^["'"']/, "").replace(/["'"']$/, "");
    // No usable value on the label line (empty or leftover punctuation like
    // "(s):"): take the next non-empty line instead.
    if (!/[A-Za-z0-9]/.test(camp) && i + 1 < lines.length) {
      camp = lines[i + 1].trim();
    }
    // Strip leading list-bullet characters from sub-bullet lines.
    camp = camp.replace(/^[•◦▪‣·*\-\s]+/, "");
    if (!/[A-Za-z0-9]/.test(camp)) break;
    result.campaignName = cleanName(camp);
    const cgidInLine =
      camp.match(/\((\d+)\)/) ||
      camp.match(/[-–]\s*(\d+)\s*$/) ||
      camp.match(/\s+(\d{4,})\s*$/);
    if (cgidInLine) result.campaignGroupId = cgidInLine[1];
    break;
  }

  // Standalone CGID
  if (!result.campaignGroupId) {
    const cgid = firstLineMatch(
      lines,
      /\b(?:CGID|Campaign\s+Group\s+ID|Campaign\s+ID)\s*:?\s*(\d+)/i,
    );
    if (cgid) result.campaignGroupId = cgid[1];
  }

  // ---- Projected Underspend ----------------------------------------------
  const pu = firstLineMatch(
    lines,
    /\bProjected\s+Underspend\s*:?\s*\$?\s*([\d,]+(?:\.\d+)?[KkMm]?)\s*(?:\(\s*(\d+(?:\.\d+)?%?)\s*\))?/i,
  );
  if (pu) {
    result.projectedUnderspend = pu[2] ? `$${pu[1]} (${pu[2]})` : `$${pu[1]}`;
  }

  // ---- Monthly Budget / Revenue Impact -----------------------------------
  // Handles: "Monthly Budget: $X", "Monthly budget and/or potential amount of
  // revenue loss: $X", and bare "Revenue: $X".
  const mb = firstLineMatch(
    lines,
    /\b(?:Monthly\s+(?:budget|Budget)[^:\n]*|Revenue(?:\s+(?:Impact|Loss))?)\s*:\s*\$?\s*([\d,]+(?:\.\d+)?[KkMm]?)/i,
  );
  if (mb) {
    result.monthlyBudget = `$${mb[1]}`;
  }

  // ---- Agency -------------------------------------------------------------
  const ag = firstLineMatch(lines, /\bAgency\s*:\s*(.+?)\s*$/i);
  if (ag) result.agency = ag[1].trim();

  // ---- PI Issue Type heuristic -------------------------------------------
  // Pacing signals beat Performance signals when both match because pacing
  // alerts often also include performance language.
  const lower = allText.toLowerCase();
  const pacingSignals = [
    /\bunderpac(?:ing|ed)\b/,
    /\bpacing\s+behind\b/,
    /\bpacing\b/,
    /\bunderspend\b/,
    /\bunderspending\b/,
    /\bdeliverab(?:ility|le)\b/,
    /\bdelivery\b/,
    /\bbehind\s+schedule\b/,
    /\bbudget\s+(?:underspend|behind)\b/,
    /\b\d+%\s*(?:of\s+)?(?:its\s+)?budget\b/, // "spent only 38% of its budget"
  ];
  const performanceSignals = [
    /\bunderperform(?:ing|ance)\b/,
    /\bperformance\s+(?:down|drop|concern)/,
    /\bperformance\b/,
    /\bdecline?(?:s|d|ing)\b/,
    /\byoy\s+(?:down|performance)/,
    /\bcp[vam]\b/i, // CPV, CPA, CPM
    /\broas\b/i,
    /\bconversion(?:s)?\s+(?:down|drop)/,
    /\bvisits?\s+(?:down|drop|declining)/,
  ];
  if (pacingSignals.some((re) => re.test(lower))) {
    result.piIssueType = "Pacing";
  } else if (performanceSignals.some((re) => re.test(lower))) {
    result.piIssueType = "Performance";
  }

  // ---- isPiAlert flag ----------------------------------------------------
  result.isPiAlert = !!(
    result.advertiser ||
    result.aidAffected ||
    result.projectedUnderspend ||
    result.monthlyBudget ||
    result.campaignGroupId ||
    result.piIssueType
  );

  return result;
}
