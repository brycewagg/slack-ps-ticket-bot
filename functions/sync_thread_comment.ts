import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { addComment } from "./utils/jira.ts";
import { ThreadTicketDatastore, threadKey } from "../datastores/thread_ticket_map.ts";

export const SyncThreadCommentFunction = DefineFunction({
  callback_id: "sync_thread_comment",
  title: "Sync Slack thread reply to Jira comment",
  source_file: "functions/sync_thread_comment.ts",
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
  output_parameters: { properties: {}, required: [] },
});

export default SlackFunction(SyncThreadCommentFunction, async ({ inputs, client, env }) => {
  const { channel_id, thread_ts, message_ts, user_id, text } = inputs;

  if (thread_ts === message_ts) {
    return { outputs: {} };
  }

  const lookup = await client.apps.datastore.get({
    datastore: ThreadTicketDatastore.name,
    id: threadKey(channel_id, thread_ts),
  });
  if (!lookup.ok || !lookup.item || !lookup.item.jira_key) {
    return { outputs: {} };
  }
  if (lookup.item.muted) {
    return { outputs: {} };
  }

  const userInfo = await client.users.info({ user: user_id });
  const userName = userInfo.ok ? (userInfo.user.real_name ?? userInfo.user.name) : user_id;

  const permalinkRes = await client.chat.getPermalink({
    channel: channel_id,
    message_ts,
  });
  const permalink = permalinkRes.ok ? permalinkRes.permalink : "";

  const commentBody = `${userName} (in Slack thread):\n${text}\n\n${permalink}`;

  try {
    await addComment(env, lookup.item.jira_key, commentBody);
  } catch (e) {
    console.error("sync_thread_comment addComment failed", e);
  }

  return { outputs: {} };
});
