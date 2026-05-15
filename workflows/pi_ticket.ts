import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { CreatePiTicketFunction } from "../functions/create_pi_ticket.ts";
import { config } from "../config.ts";

export const PiTicketWorkflow = DefineWorkflow({
  callback_id: "pi_ticket_workflow",
  title: "File PI Ticket",
  description: "Open a Performance Investigation ticket in the PS project",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channel_id: { type: Schema.slack.types.channel_id },
    },
    required: ["interactivity"],
  },
});

const form = PiTicketWorkflow.addStep(Schema.slack.functions.OpenForm, {
  title: "File PI Ticket",
  interactivity: PiTicketWorkflow.inputs.interactivity,
  submit_label: "Open ticket",
  description:
    "Performance Investigation intake. Assignee is left blank for manual routing.",
  fields: {
    elements: [
      { name: "summary", title: "Title", type: Schema.types.string },
      {
        name: "description",
        title: "Description",
        type: Schema.types.string,
        long: true,
      },
      {
        name: "pi_type",
        title: "PI Issue Type",
        type: Schema.types.string,
        enum: ["Performance", "Pacing"],
      },
      { name: "advertiser", title: "Advertiser", type: Schema.types.string },
      { name: "agency", title: "Agency", type: Schema.types.string },
      { name: "aid_affected", title: "AID Affected", type: Schema.types.string },
      { name: "campaign_group_id", title: "Campaign Group ID (cgid)", type: Schema.types.string },
      {
        name: "monthly_budget",
        title: "Monthly Budget (PEM fills if flagging)",
        type: Schema.types.string,
      },
      {
        name: "projected_underspend",
        title: "Projected Underspend (Tof/Johnny fill if flagging)",
        type: Schema.types.string,
      },
      {
        name: "pmo_rep",
        title: "PMO Rep",
        type: Schema.types.string,
        default: config.defaultPmoRep,
      },
    ],
    required: ["summary", "description", "pi_type", "advertiser"],
  },
});

const created = PiTicketWorkflow.addStep(CreatePiTicketFunction, {
  submitter_id: PiTicketWorkflow.inputs.interactivity.interactor.id,
  summary: form.outputs.fields.summary,
  description: form.outputs.fields.description,
  pi_type: form.outputs.fields.pi_type,
  advertiser: form.outputs.fields.advertiser,
  agency: form.outputs.fields.agency,
  aid_affected: form.outputs.fields.aid_affected,
  campaign_group_id: form.outputs.fields.campaign_group_id,
  monthly_budget: form.outputs.fields.monthly_budget,
  projected_underspend: form.outputs.fields.projected_underspend,
  pmo_rep: form.outputs.fields.pmo_rep,
});

PiTicketWorkflow.addStep(Schema.slack.functions.SendDm, {
  user_id: PiTicketWorkflow.inputs.interactivity.interactor.id,
  message: `Opened *${created.outputs.jira_key}*: ${created.outputs.jira_url}`,
});
