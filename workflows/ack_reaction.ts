import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { HandleAckFunction } from "../functions/handle_ack.ts";

export const AckReactionWorkflow = DefineWorkflow({
  callback_id: "ack_reaction_workflow",
  title: "ACK Reaction Workflow",
  description: "Runs when :ack: is added to a message",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.slack.types.channel_id },
      message_ts: { type: Schema.types.string },
      reacting_user_id: { type: Schema.slack.types.user_id },
    },
    required: ["channel_id", "message_ts", "reacting_user_id"],
  },
});

AckReactionWorkflow.addStep(HandleAckFunction, {
  channel_id: AckReactionWorkflow.inputs.channel_id,
  message_ts: AckReactionWorkflow.inputs.message_ts,
  reacting_user_id: AckReactionWorkflow.inputs.reacting_user_id,
});
