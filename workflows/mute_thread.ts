import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { MuteThreadFunction } from "../functions/mute_thread.ts";

export const MuteThreadWorkflow = DefineWorkflow({
  callback_id: "mute_thread_workflow",
  title: "Mute thread comment sync",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.slack.types.channel_id },
      message_ts: { type: Schema.types.string },
      reacting_user_id: { type: Schema.slack.types.user_id },
    },
    required: ["channel_id", "message_ts", "reacting_user_id"],
  },
});

MuteThreadWorkflow.addStep(MuteThreadFunction, {
  channel_id: MuteThreadWorkflow.inputs.channel_id,
  message_ts: MuteThreadWorkflow.inputs.message_ts,
  reacting_user_id: MuteThreadWorkflow.inputs.reacting_user_id,
});
