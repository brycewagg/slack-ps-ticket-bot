import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerEventTypes, TriggerTypes } from "deno-slack-api/mod.ts";
import { MuteThreadWorkflow } from "../workflows/mute_thread.ts";
import { config } from "../config.ts";

const trigger: Trigger<typeof MuteThreadWorkflow.definition> = {
  type: TriggerTypes.Event,
  name: "MUTE reaction added",
  description: "Pauses thread-to-Jira comment sync for the reacted thread",
  workflow: `#/workflows/${MuteThreadWorkflow.definition.callback_id}`,
  event: {
    event_type: TriggerEventTypes.ReactionAdded,
    channel_ids: config.channelIds,
    filter: {
      version: 1,
      root: { statement: `{{data.reaction}} == '${config.muteEmoji}'` },
    },
  },
  inputs: {
    channel_id: { value: TriggerContextData.Event.ReactionAdded.channel_id },
    message_ts: { value: TriggerContextData.Event.ReactionAdded.message_ts },
    reacting_user_id: { value: TriggerContextData.Event.ReactionAdded.user_id },
  },
};

export default trigger;
