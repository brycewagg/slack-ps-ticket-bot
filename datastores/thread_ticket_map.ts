import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

// Maps a Slack thread root (channel + message_ts) to its Jira ticket.
// Primary key is the composite "<channel>:<thread_ts>" written as a single string.
export const ThreadTicketDatastore = DefineDatastore({
  name: "thread_ticket_map",
  primary_key: "thread_key",
  attributes: {
    thread_key: { type: Schema.types.string },
    channel_id: { type: Schema.types.string },
    thread_ts: { type: Schema.types.string },
    jira_key: { type: Schema.types.string },
    muted: { type: Schema.types.boolean },
    created_at: { type: Schema.types.string },
  },
});

export function threadKey(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}
