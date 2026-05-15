import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerEventTypes, TriggerTypes } from "deno-slack-api/mod.ts";
import { SyncThreadCommentWorkflow } from "../workflows/sync_thread_comment.ts";
import { config } from "../config.ts";

// Fires on every message in watched channels. The handler filters out non-thread-reply messages
// and only acts when the thread root has a tracked Jira ticket. We can't filter on thread_ts at
// the trigger level (Slack event filters don't reliably expose it), so we do the check in code.
const trigger: Trigger<typeof SyncThreadCommentWorkflow.definition> = {
  type: TriggerTypes.Event,
  name: "Message in watched channel",
  description: "Syncs thread replies to Jira for ACK-tracked tickets",
  workflow: `#/workflows/${SyncThreadCommentWorkflow.definition.callback_id}`,
  event: {
    event_type: TriggerEventTypes.MessagePosted,
    channel_ids: config.channelIds,
    filter: {
      version: 1,
      root: {
        statement: "{{data.thread_ts}} != null",
      },
    },
  },
  inputs: {
    channel_id: { value: TriggerContextData.Event.MessagePosted.channel_id },
    thread_ts: { value: TriggerContextData.Event.MessagePosted.thread_ts },
    message_ts: { value: TriggerContextData.Event.MessagePosted.message_ts },
    user_id: { value: TriggerContextData.Event.MessagePosted.user_id },
    text: { value: TriggerContextData.Event.MessagePosted.text },
  },
};

export default trigger;
