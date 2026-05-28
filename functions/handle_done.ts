import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { config } from "../config.ts";
import { getIssueTypeId, transitionIssue } from "./utils/jira.ts";
import { ThreadTicketDatastore, threadKey } from "../datastores/thread_ticket_map.ts";
import { SLACK_TIMEOUTS, withTimeout } from "./utils/timeout.ts";

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

/**
 * Resolve the thread root and the reacted message's text robustly. Works
 * whether the reaction landed on the thread root or any reply inside it.
 *
 * conversations.replies returns messages in ascending ts order, starting
 * with the thread parent. We pull a generous slice and find both the root
 * (messages[0]) and the specific message that was reacted on (by ts match).
 */
// deno-lint-ignore no-explicit-any
async function resolveThread(client: any, channel_id: string, message_ts: string): Promise<{
  rootTs: string;
  text: string;
}> {
  try {
    const res = await withTimeout(
      client.conversations.replies({
        channel: channel_id,
        ts: message_ts,
        limit: 200,
      }),
      SLACK_TIMEOUTS.conversationsHistory,
      "conversations.replies",
    );
    if (res.ok && res.messages?.length) {
      const rootTs = res.messages[0].ts as string;
      // deno-lint-ignore no-explicit-any
      const reacted = res.messages.find((m: any) => m.ts === message_ts);
      const text = (reacted?.text ?? res.messages[0]?.text ?? "") as string;
      return { rootTs, text };
    }
  } catch (e) {
    console.error("conversations.replies failed", e);
  }
  // Fallback: assume message_ts is itself the root.
  return { rootTs: message_ts, text: "" };
}

export default SlackFunction(HandleDoneFunction, async ({ inputs, client, env }) => {
  const { channel_id, message_ts, reacting_user_id } = inputs;

  const { rootTs, text } = await resolveThread(client, channel_id, message_ts);

  // Strategy 1: look up the thread → ticket mapping in the datastore.
  // Works for any message in the thread because rootTs is normalized.
  let key: string | undefined;
  try {
    const lookup = await withTimeout(
      client.apps.datastore.get({
        datastore: ThreadTicketDatastore.name,
        id: threadKey(channel_id, rootTs),
      }),
      SLACK_TIMEOUTS.datastoreGet,
      "datastore.get",
    );
    if (lookup.ok && lookup.item && lookup.item.jira_key) {
      key = lookup.item.jira_key as string;
    }
  } catch (e) {
    console.error("datastore lookup failed", e);
  }

  // Strategy 2: fall back to parsing a PS-### key from the reacted message.
  if (!key) {
    const match = text.match(config.ticketKeyRegex);
    if (match) key = match[0].toUpperCase();
  }

  if (!key) {
    try {
      await withTimeout(
        client.chat.postEphemeral({
          channel: channel_id,
          user: reacting_user_id,
          text:
            `No ticket found for this message or thread. ` +
            `Make sure the original message was opened with :${config.ackEmoji}:, ` +
            `or include a PS-### key in the message body.`,
        }),
        SLACK_TIMEOUTS.postEphemeral,
        "chat.postEphemeral (no ticket)",
      );
    } catch (e) {
      console.error("postEphemeral (no ticket) failed", e);
    }
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
  const ephemeralText = result.transitioned
    ? `Transitioned *${key}* to ${transitionName}.`
    : `Couldn't transition *${key}*: ${result.reason ?? "unknown error"}.`;
  try {
    await withTimeout(
      client.chat.postEphemeral({
        channel: channel_id,
        user: reacting_user_id,
        text: ephemeralText,
      }),
      SLACK_TIMEOUTS.postEphemeral,
      "chat.postEphemeral (transition result)",
    );
  } catch (e) {
    console.error("postEphemeral (transition result) failed", e);
  }
  return { outputs: {} };
});
