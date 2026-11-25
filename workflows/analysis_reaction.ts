import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { HandleAnalysisFunction } from "../functions/handle_analysis.ts";

export const AnalysisReactionWorkflow = DefineWorkflow({
  callback_id: "analysis_reaction_workflow",
  title: "Analysis Reaction Workflow",
  description: "Runs when :eyes: is added to a message",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.slack.types.channel_id },
      message_ts: { type: Schema.types.string },
      reacting_user_id: { type: Schema.slack.types.user_id },
    },
    required: ["channel_id", "message_ts", "reacting_user_id"],
  },
});

AnalysisReactionWorkflow.addStep(HandleAnalysisFunction, {
  channel_id: AnalysisReactionWorkflow.inputs.channel_id,
  message_ts: AnalysisReactionWorkflow.inputs.message_ts,
  reacting_user_id: AnalysisReactionWorkflow.inputs.reacting_user_id,
});
