import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { config } from "../config.ts";
import {
  addRemoteSlackLink,
  createIssueWithFields,
  findUserAccountIdByEmail,
  issueExists,
} from "./utils/jira.ts";
import { ThreadTicketDatastore, threadKey } from "../datastores/thread_ticket_map.ts";
import { parsePi } from "./utils/parse_pi.ts";
import { buildSlackSourcedDescription } from "./utils/description.ts";
import { SLACK_TIMEOUTS, withTimeout } from "./utils/timeout.ts";

// Issue type ID for Performance Investigation on PS (validated 2026-05-15)
const PI_ISSUE_TYPE_ID = "12823";

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

async function resolveSlackUser(
  // deno-lint-ignore no-explicit-any
  client: any,
  userId: string,
): Promise<{ displayName: string; email?: string }> {
  try {
    const res = await withTimeout(
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

async function resolveChannelName(
  // deno-lint-ignore no-explicit-any
  client: any,
  channelId: string,
): Promise<string | undefined> {
  try {
    const res = await withTimeout(
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

export default SlackFunction(HandleAckFunction, async ({ inputs, client, env }) => {
  const { channel_id, message_ts, reacting_user_id } = inputs;

  const history = await withTimeout(
    client.conversations.history({
      channel: channel_id,
      latest: message_ts,
      inclusive: true,
      limit: 1,
    }),
    SLACK_TIMEOUTS.conversationsHistory,
    "conversations.history",
  );
  if (!history.ok || !history.messages?.length) {
    console.error("conversations.history failed", history);
    return { outputs: {} };
  }
  const message = history.messages[0];
  const text: string = message.text ?? "";

  const [permalinkRes, reactor, channelName] = await Promise.all([
    withTimeout(
      client.chat.getPermalink({ channel: channel_id, message_ts }),
      SLACK_TIMEOUTS.chatGetPermalink,
      "chat.getPermalink",
    ),
    resolveSlackUser(client, reacting_user_id),
    resolveChannelName(client, channel_id),
  ]);
  const permalink: string = permalinkRes.ok ? permalinkRes.permalink : "";
  const reactorName = reactor.displayName;

  // Reporter should be the MESSAGE AUTHOR (the issue raiser), not the reactor.
  // Jen's PS automation rules key off Reporter: if a PEM creates the ticket,
  // it auto-assigns to Tof; if Tof creates it, it stays unassigned. The
  // reactor (on-call PM) is acknowledging the issue, not raising it.
  // Falls back to the reactor if the message is from a bot or has no user.
  const messageAuthorId: string | undefined = message.user || undefined;
  let reporterAccountId: string | undefined;
  if (messageAuthorId && !message.bot_id) {
    const author = await resolveSlackUser(client, messageAuthorId);
    if (author.email) {
      try {
        reporterAccountId = await findUserAccountIdByEmail(env, author.email);
      } catch (e) {
        console.error("Jira user lookup (author) failed", e);
      }
    }
  }
  if (!reporterAccountId && reactor.email) {
    try {
      reporterAccountId = await findUserAccountIdByEmail(env, reactor.email);
    } catch (e) {
      console.error("Jira user lookup (reactor fallback) failed", e);
    }
  }

  const existingMatch = text.match(config.ticketKeyRegex);
  if (existingMatch) {
    const key = existingMatch[0].toUpperCase();
    const exists = await issueExists(env, key);
    if (exists) {
      try {
        await addRemoteSlackLink(env, key, {
          url: permalink,
          title: `Slack message (reacted by ${reactorName})`,
        });
      } catch (e) {
        console.error("addRemoteSlackLink failed", e);
      }
      await recordThreadMapping(client, channel_id, message_ts, key);
      try {
        await withTimeout(
          client.chat.postMessage({
            channel: channel_id,
            thread_ts: message_ts,
            text:
              `:link: Linked Slack to existing ticket *${key}*: ${env.JIRA_BASE_URL}/browse/${key}\n` +
              `Replies in this thread will sync as Jira comments. React :${config.muteEmoji}: to pause.`,
          }),
          SLACK_TIMEOUTS.postMessage,
          "chat.postMessage (linked)",
        );
      } catch (e) {
        console.error("post linked-ticket reply failed", e);
      }
      return { outputs: {} };
    }
  }

  const pi = parsePi(text);
  const firstLine = text.split("\n")[0].slice(0, 200) || "Slack message";

  // Summary preference: "<Advertiser> — <Campaign>" if both, else campaign, else first line.
  let summary: string;
  if (pi.isPiAlert && (pi.advertiser || pi.campaignName)) {
    const parts = [pi.advertiser, pi.campaignName].filter(Boolean);
    summary = parts.join(" — ").slice(0, 200) || firstLine;
  } else {
    summary = firstLine.length < text.length ? `${firstLine}…` : firstLine;
  }

  const description = buildSlackSourcedDescription({
    reactorDisplayName: reactorName,
    permalink,
    originalText: text,
    channelName,
  });

  const cf = config.jiraCustomFields;
  const fields: Record<string, unknown> = {
    project: { key: config.projectKey },
    issuetype: { id: pi.isPiAlert ? PI_ISSUE_TYPE_ID : config.ackIssueTypeId },
    summary,
    description,
  };
  if (reporterAccountId) {
    fields.reporter = { accountId: reporterAccountId };
  }

  if (pi.isPiAlert) {
    if (pi.advertiser) fields[cf.advertiser] = pi.advertiser;
    if (pi.aidAffected) fields[cf.aidAffected] = pi.aidAffected;
    if (pi.campaignGroupId) fields[cf.campaignGroupId] = pi.campaignGroupId;
    if (pi.projectedUnderspend) fields[cf.projectedUnderspend] = pi.projectedUnderspend;
    if (pi.monthlyBudget) fields[cf.revenueImpact] = pi.monthlyBudget;
    if (pi.agency) fields[cf.agency] = pi.agency;
    if (pi.piIssueType) fields[cf.piIssueType] = [{ value: pi.piIssueType }];
  }

  try {
    const created = await createIssueWithFields(env, fields);
    await addRemoteSlackLink(env, created.key, {
      url: permalink,
      title: channelName ? `Slack message in #${channelName}` : "Slack source message",
    });
    await recordThreadMapping(client, channel_id, message_ts, created.key);
    try {
      await withTimeout(
        client.chat.postMessage({
          channel: channel_id,
          thread_ts: message_ts,
          text:
            `:rocket: Opened *${created.key}*: ${env.JIRA_BASE_URL}/browse/${created.key}\n` +
            `Replies in this thread will sync as Jira comments. React :${config.muteEmoji}: on the thread root to pause.`,
        }),
        SLACK_TIMEOUTS.postMessage,
        "chat.postMessage (new ticket)",
      );
    } catch (e) {
      console.error("post new-ticket reply failed", e);
    }
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
