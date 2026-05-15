import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerEventTypes, TriggerTypes } from "deno-slack-api/mod.ts";
import { AckReactionWorkflow } from "../workflows/ack_reaction.ts";
import { config } from "../config.ts";

const trigger: Trigger<typeof AckReactionWorkflow.definition> = {
  type: TriggerTypes.Event,
  name: "ACK reaction added",
  description: "Fires when :ack: is added to a message in a watched channel",
  workflow: `#/workflows/${AckReactionWorkflow.definition.callback_id}`,
  event: {
    event_type: TriggerEventTypes.ReactionAdded,
    channel_ids: config.channelIds,
    filter: {
      version: 1,
      root: {
        statement: `{{data.reaction}} == '${config.ackEmoji}'`,
      },
    },
  },
  inputs: {
    channel_id: { value: TriggerContextData.Event.ReactionAdded.channel_id },
    message_ts: { value: TriggerContextData.Event.ReactionAdded.message_ts },
    reacting_user_id: { value: TriggerContextData.Event.ReactionAdded.user_id },
  },
};

export default trigger;
