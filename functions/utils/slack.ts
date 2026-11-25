// Small Slack Web API helpers shared by reaction handlers.
// Kept here (rather than inline per handler) so the :eyes: analysis route and
// any future route resolve users/channels the same way.

import { SLACK_TIMEOUTS, withTimeout } from "./timeout.ts";

export async function resolveSlackUser(
  // deno-lint-ignore no-explicit-any
  client: any,
  userId: string,
): Promise<{ displayName: string; email?: string }> {
  try {
    // deno-lint-ignore no-explicit-any
    const res = await withTimeout<any>(
      client.users.info({ user: userId }),
      SLACK_TIMEOUTS.usersInfo,
      "users.info",
    );
    if (res.ok && res.user) {
      const displayName = res.user.profile?.display_name_normalized ||
        res.user.profile?.real_name_normalized ||
        res.user.real_name ||
        res.user.name ||
        userId;
      const email = res.user.profile?.email;
      return { displayName, email };
    }
  } catch (e) {
    console.error("users.info failed", e);
  }
  return { displayName: userId };
}

export async function resolveChannelName(
  // deno-lint-ignore no-explicit-any
  client: any,
  channelId: string,
): Promise<string | undefined> {
  try {
    // deno-lint-ignore no-explicit-any
    const res = await withTimeout<any>(
      client.conversations.info({ channel: channelId }),
      SLACK_TIMEOUTS.conversationsInfo,
      "conversations.info",
    );
    if (res.ok && res.channel?.name) return res.channel.name;
  } catch (e) {
    console.error("conversations.info failed", e);
  }
  return undefined;
}
