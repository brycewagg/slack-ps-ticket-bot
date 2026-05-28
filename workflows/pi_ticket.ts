import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { CreatePiTicketFunction } from "../functions/create_pi_ticket.ts";

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
    "Performance Investigation intake. PMO Rep is auto-set by Jira automation.",
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
      {
        name: "campaign_group_id",
        title: "Campaign Group ID (cgid)",
        type: Schema.types.string,
      },
      {
        name: "revenue_impact",
        title: "Revenue Impact / Monthly Budget (PEM fills if flagging)",
        type: Schema.types.string,
      },
      {
        name: "projected_underspend",
        title: "Projected Underspend (Tof/Johnny fill if flagging)",
        type: Schema.types.string,
      },
    ],
    // Only the bare essentials are required. Per Jen, she doesn't want
    // anything mandatory right now while the team is still adopting it.
    required: ["summary", "description"],
  },
});

PiTicketWorkflow.addStep(CreatePiTicketFunction, {
  submitter_id: PiTicketWorkflow.inputs.interactivity.interactor.id,
  summary: form.outputs.fields.summary,
  description: form.outputs.fields.description,
  pi_type: form.outputs.fields.pi_type,
  advertiser: form.outputs.fields.advertiser,
  agency: form.outputs.fields.agency,
  aid_affected: form.outputs.fields.aid_affected,
  campaign_group_id: form.outputs.fields.campaign_group_id,
  revenue_impact: form.outputs.fields.revenue_impact,
  projected_underspend: form.outputs.fields.projected_underspend,
});
// Note: the function sends its own DM so it can include degraded-mode
// messaging if the channel post fails. The SendDm step was removed.
