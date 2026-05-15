import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { ThreadTicketDatastore, threadKey } from "../datastores/thread_ticket_map.ts";

export const MuteThreadFunction = DefineFunction({
  callback_id: "mute_thread",
  title: "Mute thread comment sync",
  source_file: "functions/mute_thread.ts",
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

export default SlackFunction(MuteThreadFunction, async ({ inputs, client }) => {
  const { channel_id, message_ts, reacting_user_id } = inputs;

  const history = await client.conversations.history({
    channel: channel_id,
    latest: message_ts,
    inclusive: true,
    limit: 1,
  });
  const msg = history.ok ? history.messages?.[0] : undefined;
  const rootTs = msg?.thread_ts ?? message_ts;

  const key = threadKey(channel_id, rootTs);
  const existing = await client.apps.datastore.get({
    datastore: ThreadTicketDatastore.name,
    id: key,
  });
  if (!existing.ok || !existing.item || !existing.item.jira_key) {
    await client.chat.postEphemeral({
      channel: channel_id,
      user: reacting_user_id,
      text: "No tracked ticket for this thread, nothing to mute.",
    });
    return { outputs: {} };
  }

  await client.apps.datastore.update({
    datastore: ThreadTicketDatastore.name,
    item: { ...existing.item, muted: true },
  });
  await client.chat.postEphemeral({
    channel: channel_id,
    user: reacting_user_id,
    text: `Muted sync for *${existing.item.jira_key}*. New replies won't be posted as Jira comments.`,
  });
  return { outputs: {} };
});
