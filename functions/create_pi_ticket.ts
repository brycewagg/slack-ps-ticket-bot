import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { config } from "../config.ts";
import { createIssueWithFields } from "./utils/jira.ts";

export const CreatePiTicketFunction = DefineFunction({
  callback_id: "create_pi_ticket",
  title: "Create PI ticket from form input",
  source_file: "functions/create_pi_ticket.ts",
  input_parameters: {
    properties: {
      submitter_id: { type: Schema.slack.types.user_id },
      summary: { type: Schema.types.string },
      description: { type: Schema.types.string },
      pi_type: { type: Schema.types.array, items: { type: Schema.types.string } },
      revenue_impact: { type: Schema.types.string },
      projected_underspend: { type: Schema.types.string },
      advertiser: { type: Schema.types.string },
      agency: { type: Schema.types.string },
      aid_affected: { type: Schema.types.string },
      campaign_group_id: { type: Schema.types.string },
      pmo_rep: { type: Schema.types.string },
    },
    required: ["submitter_id", "summary", "description", "pi_type", "advertiser"],
  },
  output_parameters: {
    properties: {
      jira_key: { type: Schema.types.string },
      jira_url: { type: Schema.types.string },
    },
    required: ["jira_key", "jira_url"],
  },
});

export default SlackFunction(CreatePiTicketFunction, async ({ inputs, env }) => {
  const cf = config.jiraCustomFields;

  const fields: Record<string, unknown> = {
    project: { key: config.projectKey },
    issuetype: { name: config.piIssueType },
    summary: inputs.summary,
    description: {
      type: "doc",
      version: 1,
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: `${inputs.description}\n\nFiled from Slack by <@${inputs.submitter_id}>`,
        }],
      }],
    },
    // multi-select expects an array of { value }
    [cf.piIssueType]: inputs.pi_type.map((v) => ({ value: v })),
    [cf.advertiser]: inputs.advertiser,
  };

  if (inputs.agency) fields[cf.agency] = inputs.agency;
  if (inputs.aid_affected) fields[cf.aidAffected] = inputs.aid_affected;
  if (inputs.campaign_group_id) fields[cf.campaignGroupId] = inputs.campaign_group_id;
  if (inputs.revenue_impact) fields[cf.revenueImpact] = inputs.revenue_impact;
  if (inputs.projected_underspend) fields[cf.projectedUnderspend] = inputs.projected_underspend;
  if (inputs.pmo_rep) fields[cf.pmoRep] = { value: inputs.pmo_rep };

  const created = await createIssueWithFields(env, fields);
  return {
    outputs: {
      jira_key: created.key,
      jira_url: `${env.JIRA_BASE_URL}/browse/${created.key}`,
    },
  };
});
