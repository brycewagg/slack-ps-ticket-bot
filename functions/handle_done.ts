import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { config } from "../config.ts";
import { getIssueTypeId, transitionIssue } from "./utils/jira.ts";
import { ThreadTicketDatastore, threadKey } from "../datastores/thread_ticket_map.ts";

export const HandleDoneFunction = DefineFunction({
  callback_id: "handle_done",
  title: "Handle DONE reaction",
  description: "Transition a PS ticket referenced in the message (or its thread) to Done",
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
  const msg = history.ok ? history.messages?.[0] : undefined;
  const text: string = msg?.text ?? "";
  const rootTs: string = msg?.thread_ts ?? message_ts;

  // Strategy 1: look up the thread → ticket mapping in the datastore.
  // This is the cleanest path because :on_it: writes that mapping.
  let key: string | undefined;
  try {
    const lookup = await client.apps.datastore.get({
      datastore: ThreadTicketDatastore.name,
      id: threadKey(channel_id, rootTs),
    });
    if (lookup.ok && lookup.item && lookup.item.jira_key) {
      key = lookup.item.jira_key as string;
    }
  } catch (e) {
    console.error("datastore lookup failed", e);
  }

  // Strategy 2: fall back to parsing a PS-### key from the message body.
  if (!key) {
    const match = text.match(config.ticketKeyRegex);
    if (match) key = match[0].toUpperCase();
  }

  if (!key) {
    await client.chat.postEphemeral({
      channel: channel_id,
      user: reacting_user_id,
      text:
        `No ticket found for this message or thread. ` +
        `Make sure the original message was opened with :${config.ackEmoji}:, ` +
        `or include a PS-### key in the message body.`,
    });
    return { outputs: {} };
  }

  // Pick transition by issue type. PI tickets use "Done"; others use "Resolved".
  let transitionName = config.doneTransitionName;
  try {
    const issueTypeId = await getIssueTypeId(env, key);
    if (issueTypeId && config.doneTransitionByIssueTypeId[issueTypeId]) {
      transitionName = config.doneTransitionByIssueTypeId[issueTypeId];
    }
  } catch (e) {
    console.error("issue type lookup failed; using default transition", e);
  }

  const result = await transitionIssue(env, key, transitionName);
  if (result.transitioned) {
    await client.chat.postEphemeral({
      channel: channel_id,
      user: reacting_user_id,
      text: `Transitioned *${key}* to ${transitionName}.`,
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
