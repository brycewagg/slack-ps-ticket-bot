import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SyncThreadCommentFunction } from "../functions/sync_thread_comment.ts";

export const SyncThreadCommentWorkflow = DefineWorkflow({
  callback_id: "sync_thread_comment_workflow",
  title: "Sync Slack thread reply to Jira",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.slack.types.channel_id },
      thread_ts: { type: Schema.types.string },
      message_ts: { type: Schema.types.string },
      user_id: { type: Schema.slack.types.user_id },
      text: { type: Schema.types.string },
    },
    required: ["channel_id", "thread_ts", "message_ts", "user_id", "text"],
  },
});

SyncThreadCommentWorkflow.addStep(SyncThreadCommentFunction, {
  channel_id: SyncThreadCommentWorkflow.inputs.channel_id,
  thread_ts: SyncThreadCommentWorkflow.inputs.thread_ts,
  message_ts: SyncThreadCommentWorkflow.inputs.message_ts,
  user_id: SyncThreadCommentWorkflow.inputs.user_id,
  text: SyncThreadCommentWorkflow.inputs.text,
});
