import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { config } from "../config.ts";
import { createIssueWithFields, findUserAccountIdByEmail } from "./utils/jira.ts";
import { ThreadTicketDatastore, threadKey } from "../datastores/thread_ticket_map.ts";

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
    },
    required: ["jira_key", "jira_url"],
  },
});

export default SlackFunction(CreatePiTicketFunction, async ({ inputs, client, env }) => {
  const cf = config.jiraCustomFields;

  // Resolve submitter display name + email so we can set Reporter correctly.
  let submitterName = inputs.submitter_id;
  let submitterEmail: string | undefined;
  try {
    const u = await client.users.info({ user: inputs.submitter_id });
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

  // All custom fields are now optional from the form. Only set when provided.
  // PI Issue Type: filer picks Pacing/Performance if known.
  // PMO Rep is auto-set by Jira automation to Trixy.
  if (inputs.pi_type) {
    fields[cf.piIssueType] = [{ value: inputs.pi_type }];
  }
  if (inputs.advertiser) fields[cf.advertiser] = inputs.advertiser;
  if (inputs.agency) fields[cf.agency] = inputs.agency;
  if (inputs.aid_affected) fields[cf.aidAffected] = inputs.aid_affected;
  if (inputs.campaign_group_id) fields[cf.campaignGroupId] = inputs.campaign_group_id;
  if (inputs.revenue_impact) fields[cf.revenueImpact] = inputs.revenue_impact;
  if (inputs.projected_underspend) fields[cf.projectedUnderspend] = inputs.projected_underspend;

  const created = await createIssueWithFields(env, fields);
  const jiraUrl = `${env.JIRA_BASE_URL}/browse/${created.key}`;

  // Post a public announcement in the PI channel and register the thread
  // for comment-sync so follow-up replies land on the Jira ticket.
  try {
    const announcement = await client.chat.postMessage({
      channel: config.piNotificationChannelId,
      text:
        `:rocket: New PI ticket: *${created.key}* — ${jiraUrl}\n` +
        `Filed by <@${inputs.submitter_id}>. Reply in this thread to discuss; ` +
        `replies sync to Jira as comments. React :${config.muteEmoji}: to pause.`,
    });
    if (announcement.ok && announcement.ts) {
      await client.apps.datastore.put({
        datastore: ThreadTicketDatastore.name,
        item: {
          thread_key: threadKey(config.piNotificationChannelId, announcement.ts),
          channel_id: config.piNotificationChannelId,
          thread_ts: announcement.ts,
          jira_key: created.key,
          muted: false,
          created_at: new Date().toISOString(),
        },
      });
    }
  } catch (e) {
    console.error("channel announcement failed", e);
  }

  return {
    outputs: {
      jira_key: created.key,
      jira_url: jiraUrl,
    },
  };
});
