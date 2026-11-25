import { Trigger } from "deno-slack-sdk/types.ts";
import {
  TriggerContextData,
  TriggerEventTypes,
  TriggerTypes,
} from "deno-slack-api/mod.ts";
import { AnalysisReactionWorkflow } from "../workflows/analysis_reaction.ts";
import { config } from "../config.ts";

const trigger: Trigger<typeof AnalysisReactionWorkflow.definition> = {
  type: TriggerTypes.Event,
  name: "Analysis reaction added",
  description:
    `Fires when :${config.analysisEmoji}: is added to a message in a watched channel`,
  workflow: `#/workflows/${AnalysisReactionWorkflow.definition.callback_id}`,
  event: {
    event_type: TriggerEventTypes.ReactionAdded,
    channel_ids: config.channelIds,
    filter: {
      version: 1,
      root: {
        statement: `{{data.reaction}} == '${config.analysisEmoji}'`,
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
