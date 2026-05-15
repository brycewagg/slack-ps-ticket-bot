import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { config } from "../config.ts";
import { addRemoteSlackLink, createIssue, issueExists } from "./utils/jira.ts";
import { ThreadTicketDatastore, threadKey } from "../datastores/thread_ticket_map.ts";

export const HandleAckFunction = DefineFunction({
  callback_id: "handle_ack",
  title: "Handle ACK reaction",
  description: "Create a PS ticket for the message, or link existing ticket back to Slack",
  source_file: "functions/handle_ack.ts",
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

async function recordThreadMapping(
  client: { apps: { datastore: { put: (args: unknown) => Promise<unknown> } } },
  channelId: string,
  threadTs: string,
  jiraKey: string,
): Promise<void> {
  await client.apps.datastore.put({
    datastore: ThreadTicketDatastore.name,
    item: {
      thread_key: threadKey(channelId, threadTs),
      channel_id: channelId,
      thread_ts: threadTs,
      jira_key: jiraKey,
      muted: false,
      created_at: new Date().toISOString(),
    },
  });
}

export default SlackFunction(HandleAckFunction, async ({ inputs, client, env }) => {
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
  const message = history.messages[0];
  const text: string = message.text ?? "";

  const permalinkRes = await client.chat.getPermalink({
    channel: channel_id,
    message_ts,
  });
  const permalink: string = permalinkRes.ok ? permalinkRes.permalink : "";

  const existingMatch = text.match(config.ticketKeyRegex);
  if (existingMatch) {
    const key = existingMatch[0].toUpperCase();
    const exists = await issueExists(env, key);
    if (exists) {
      try {
        await addRemoteSlackLink(env, key, {
          url: permalink,
          title: `Slack message (reacted by <@${reacting_user_id}>)`,
        });
      } catch (e) {
        console.error("addRemoteSlackLink failed", e);
      }
      await recordThreadMapping(client, channel_id, message_ts, key);
      await client.chat.postEphemeral({
        channel: channel_id,
        user: reacting_user_id,
        text:
          `Ticket *${key}* already exists for this message. I added a Slack link to it: ` +
          `${env.JIRA_BASE_URL}/browse/${key}\n` +
          `Replies in this thread will sync as Jira comments. React :${config.muteEmoji}: to pause.`,
      });
      return { outputs: {} };
    }
  }

  const firstLine = text.split("\n")[0].slice(0, 200) || "Slack message";
  const summary = firstLine.length < text.length ? `${firstLine}…` : firstLine;
  const descriptionText =
    `Opened from Slack via :${config.ackEmoji}: by <@${reacting_user_id}>.\n\n` +
    `Slack permalink: ${permalink}\n\n---\n${text}`;

  try {
    const created = await createIssue(env, {
      projectKey: config.projectKey,
      issueType: config.issueType,
      summary,
      descriptionText,
    });
    await addRemoteSlackLink(env, created.key, {
      url: permalink,
      title: "Slack source message",
    });
    await recordThreadMapping(client, channel_id, message_ts, created.key);
    await client.chat.postEphemeral({
      channel: channel_id,
      user: reacting_user_id,
      text:
        `Opened *${created.key}* in ${config.projectKey}: ` +
        `${env.JIRA_BASE_URL}/browse/${created.key}\n` +
        `Replies in this thread will sync as Jira comments. React :${config.muteEmoji}: on the thread root to pause.`,
    });
  } catch (e) {
    console.error("createIssue failed", e);
    await client.chat.postEphemeral({
      channel: channel_id,
      user: reacting_user_id,
      text: `Couldn't open a ticket: ${(e as Error).message}`,
    });
  }

  return { outputs: {} };
});
