import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { config } from "../config.ts";
import { transitionIssue } from "./utils/jira.ts";

export const HandleDoneFunction = DefineFunction({
  callback_id: "handle_done",
  title: "Handle DONE reaction",
  description: "Transition a PS ticket referenced in the message to Done",
  source_file: "functions/handle_done.ts",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.slack.types.channel_id },
      message_ts: { type: Schema.types.string },
      reacting_user_id: { type: Schema.slack.types.user_id },
    },
    required: ["channel_id", "message_ts", "reacting_user_id"],
  },
  output_parameters: { properties: {}, required: [] },
});

export default SlackFunction(HandleDoneFunction, async ({ inputs, client, env }) => {
  const { channel_id, message_ts, reacting_user_id } = inputs;

  const history = await client.conversations.history({
    channel: channel_id,
    latest: message_ts,
    inclusive: true,
    limit: 1,
  });
  if (!history.ok || !history.messages?.length) {
    console.error("conversations.history failed", history);
    return { outputs: {} };
  }
  const text: string = history.messages[0].text ?? "";

  const match = text.match(config.ticketKeyRegex);
  if (!match) {
    return { outputs: {} };
  }
  const key = match[0].toUpperCase();

  const result = await transitionIssue(env, key, config.doneTransitionName);
  if (result.transitioned) {
    await client.chat.postEphemeral({
      channel: channel_id,
      user: reacting_user_id,
      text: `Transitioned *${key}* to ${config.doneTransitionName}.`,
    });
  } else {
    await client.chat.postEphemeral({
      channel: channel_id,
      user: reacting_user_id,
      text: `Couldn't transition *${key}*: ${result.reason ?? "unknown error"}.`,
    });
  }
  return { outputs: {} };
});
