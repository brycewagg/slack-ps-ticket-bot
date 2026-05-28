import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { config } from "../config.ts";
import { createIssueWithFields, findUserAccountIdByEmail } from "./utils/jira.ts";
import { ThreadTicketDatastore, threadKey } from "../datastores/thread_ticket_map.ts";
import { SLACK_TIMEOUTS, withTimeout } from "./utils/timeout.ts";
import { parsePi } from "./utils/parse_pi.ts";

export const CreatePiTicketFunction = DefineFunction({
  callback_id: "create_pi_ticket",
  title: "Create PI ticket from form input",
  source_file: "functions/create_pi_ticket.ts",
  input_parameters: {
    properties: {
      submitter_id: { type: Schema.slack.types.user_id },
      summary: { type: Schema.types.string },
      description: { type: Schema.types.string },
      pi_type: { type: Schema.types.string },
      revenue_impact: { type: Schema.types.string },
      projected_underspend: { type: Schema.types.string },
      advertiser: { type: Schema.types.string },
      agency: { type: Schema.types.string },
      aid_affected: { type: Schema.types.string },
      campaign_group_id: { type: Schema.types.string },
    },
    required: ["submitter_id", "summary", "description"],
  },
  output_parameters: {
    properties: {
      jira_key: { type: Schema.types.string },
      jira_url: { type: Schema.types.string },
      slack_post_status: { type: Schema.types.string },
    },
    required: ["jira_key", "jira_url", "slack_post_status"],
  },
});

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Build the channel-announcement text with full ticket context so people don't
 * have to click into Jira to see what the ticket is about (per Jen's 5/27 ask).
 */
function buildAnnouncementText(args: {
  jiraKey: string;
  jiraUrl: string;
  submitterId: string;
  title: string;
  description: string;
  piType?: string;
  advertiser?: string;
  aidAffected?: string;
  campaignGroupId?: string;
  muteEmoji: string;
}): string {
  const lines: string[] = [];
  lines.push(`:rocket: *New PI ticket: ${args.jiraKey}* — ${args.jiraUrl}`);
  lines.push(`Filed by <@${args.submitterId}>`);
  lines.push(`• *Title:* ${args.title}`);

  // Advertiser line combines advertiser + AID if both are present
  if (args.advertiser || args.aidAffected) {
    const parts = [args.advertiser, args.aidAffected ? `AID ${args.aidAffected}` : ""]
      .filter(Boolean)
      .join(" — ");
    lines.push(`• *Advertiser:* ${parts}`);
  }
  if (args.campaignGroupId) {
    lines.push(`• *Campaign Group ID:* ${args.campaignGroupId}`);
  }
  if (args.piType) {
    lines.push(`• *PI Issue Type:* ${args.piType}`);
  }
  // Description last; truncate so the post stays scannable.
  lines.push(`• *Description:* ${truncate(args.description, 400)}`);
  lines.push("");
  lines.push(
    `Reply in this thread to discuss; replies sync to Jira as comments. ` +
      `React :${args.muteEmoji}: to pause.`,
  );
  return lines.join("\n");
}

export default SlackFunction(CreatePiTicketFunction, async ({ inputs, client, env }) => {
  const cf = config.jiraCustomFields;

  // Resolve submitter display name + email so we can set Reporter correctly.
  let submitterName = inputs.submitter_id;
  let submitterEmail: string | undefined;
  try {
    const u = await withTimeout(
      client.users.info({ user: inputs.submitter_id }),
      SLACK_TIMEOUTS.usersInfo,
      "users.info",
    );
    if (u.ok && u.user) {
      submitterName = u.user.profile?.display_name_normalized ||
        u.user.profile?.real_name_normalized ||
        u.user.real_name ||
        u.user.name ||
        inputs.submitter_id;
      submitterEmail = u.user.profile?.email;
    }
  } catch (e) {
    console.error("users.info failed", e);
  }

  // Look up Jira accountId so PS automation rules (auto-assign + PMO rep) fire correctly.
  let submitterJiraAccountId: string | undefined;
  if (submitterEmail) {
    try {
      submitterJiraAccountId = await findUserAccountIdByEmail(env, submitterEmail);
    } catch (e) {
      console.error("Jira user lookup failed", e);
    }
  }

  const descriptionAdf = {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Filed from the Slack PI Ticket form by " },
          { type: "text", text: submitterName, marks: [{ type: "strong" }] },
          { type: "text", text: "." },
        ],
      },
      { type: "rule" },
      {
        type: "paragraph",
        content: [{ type: "text", text: inputs.description }],
      },
    ],
  };

  const fields: Record<string, unknown> = {
    project: { key: config.projectKey },
    issuetype: { name: config.piIssueType },
    summary: inputs.summary,
    description: descriptionAdf,
  };
  if (submitterJiraAccountId) {
    fields.reporter = { accountId: submitterJiraAccountId };
  }
  // Run the parser once over the form text. Form values win; parser fills
  // the blanks. Catches the common case where the filer writes a structured
  // description ("Advertiser: X (NNNN)", "Agency: Y") but leaves the matching
  // form fields empty. If the description is freeform prose without those
  // labels, the parser stays quiet and the field remains blank.
  const piHeuristic = parsePi(`${inputs.summary}\n${inputs.description}`);

  const resolvedPiType = inputs.pi_type || piHeuristic.piIssueType;
  const resolvedAdvertiser = inputs.advertiser || piHeuristic.advertiser;
  const resolvedAgency = inputs.agency || piHeuristic.agency;
  const resolvedAid = inputs.aid_affected || piHeuristic.aidAffected;
  const resolvedCgid = inputs.campaign_group_id || piHeuristic.campaignGroupId;
  const resolvedRevenue = inputs.revenue_impact || piHeuristic.monthlyBudget;
  const resolvedUnderspend = inputs.projected_underspend || piHeuristic.projectedUnderspend;

  if (resolvedPiType) fields[cf.piIssueType] = [{ value: resolvedPiType }];
  if (resolvedAdvertiser) fields[cf.advertiser] = resolvedAdvertiser;
  if (resolvedAgency) fields[cf.agency] = resolvedAgency;
  if (resolvedAid) fields[cf.aidAffected] = resolvedAid;
  if (resolvedCgid) fields[cf.campaignGroupId] = resolvedCgid;
  if (resolvedRevenue) fields[cf.revenueImpact] = resolvedRevenue;
  if (resolvedUnderspend) fields[cf.projectedUnderspend] = resolvedUnderspend;

  const created = await createIssueWithFields(env, fields);
  const jiraUrl = `${env.JIRA_BASE_URL}/browse/${created.key}`;

  // Post a rich announcement in the PI channel and register the thread for
  // comment-sync so follow-up replies land on the Jira ticket. Both calls
  // are bounded by a timeout so a Slack outage can't hang the workflow.
  let slackPostStatus = "ok";
  try {
    const announcementText = buildAnnouncementText({
      jiraKey: created.key,
      jiraUrl,
      submitterId: inputs.submitter_id,
      title: inputs.summary,
      description: inputs.description,
      piType: resolvedPiType,
      advertiser: resolvedAdvertiser,
      aidAffected: resolvedAid,
      campaignGroupId: resolvedCgid,
      muteEmoji: config.muteEmoji,
    });
    const announcement = await withTimeout(
      client.chat.postMessage({
        channel: config.piNotificationChannelId,
        text: announcementText,
      }),
      SLACK_TIMEOUTS.postMessage,
      "chat.postMessage",
    );
    if (announcement.ok && announcement.ts) {
      await withTimeout(
        client.apps.datastore.put({
          datastore: ThreadTicketDatastore.name,
          item: {
            thread_key: threadKey(config.piNotificationChannelId, announcement.ts),
            channel_id: config.piNotificationChannelId,
            thread_ts: announcement.ts,
            jira_key: created.key,
            muted: false,
            created_at: new Date().toISOString(),
          },
        }),
        SLACK_TIMEOUTS.datastorePut,
        "datastore.put",
      );
    } else {
      slackPostStatus = "post_not_ok";
    }
  } catch (e) {
    slackPostStatus = "timeout_or_error";
    console.error("channel announcement failed", e);
  }

  // DM the submitter directly with the ticket link. If the channel post
  // timed out, the DM is the only confirmation they get, so include a note.
  // Bounded by a timeout so a Slack outage can't hang the workflow further.
  const dmMessage = slackPostStatus === "ok"
    ? `Opened *${created.key}*: ${jiraUrl}`
    : `Opened *${created.key}*: ${jiraUrl}\n` +
      `:warning: The channel announcement in <#${config.piNotificationChannelId}> ` +
      `couldn't be posted (Slack may be degraded). Your ticket is created but the ` +
      `team thread didn't go out. You can manually share the ticket link or retry later.`;
  try {
    await withTimeout(
      client.chat.postMessage({
        channel: inputs.submitter_id,
        text: dmMessage,
      }),
      SLACK_TIMEOUTS.postMessage,
      "submitter DM",
    );
  } catch (e) {
    console.error("submitter DM failed", e);
  }

  return {
    outputs: {
      jira_key: created.key,
      jira_url: jiraUrl,
      slack_post_status: slackPostStatus,
    },
  };
});
