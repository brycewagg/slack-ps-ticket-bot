import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { HandleDoneFunction } from "../functions/handle_done.ts";

export const DoneReactionWorkflow = DefineWorkflow({
  callback_id: "done_reaction_workflow",
  title: "DONE Reaction Workflow",
  description: "Runs when :resolved: is added to a message",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.slack.types.channel_id },
      message_ts: { type: Schema.types.string },
      reacting_user_id: { type: Schema.slack.types.user_id },
    },
    required: ["channel_id", "message_ts", "reacting_user_id"],
  },
});

DoneReactionWorkflow.addStep(HandleDoneFunction, {
  channel_id: DoneReactionWorkflow.inputs.channel_id,
  message_ts: DoneReactionWorkflow.inputs.message_ts,
  reacting_user_id: DoneReactionWorkflow.inputs.reacting_user_id,
});
