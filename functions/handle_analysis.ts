import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { config } from "../config.ts";
import {
  addRemoteSlackLink,
  assignIssue,
  createIssueWithFields,
  issueExists,
} from "./utils/jira.ts";
import { buildSlackSourcedDescription } from "./utils/description.ts";
import { resolveChannelName, resolveSlackUser } from "./utils/slack.ts";
import { SLACK_TIMEOUTS, withTimeout } from "./utils/timeout.ts";

// :eyes: route. Opens a Data Monitoring "Analysis" ticket from a single Slack
// message, auto-assigned to Pratik. Unlike the PS :on_it: flow this does NOT
// record a thread mapping, so the message_event sync leaves it alone and thread
// replies are never mirrored into Jira comments. The ticket captures the
// triggering message ("main issue points") and nothing more.
export const HandleAnalysisFunction = DefineFunction({
  callback_id: "handle_analysis",
  title: "Handle :eyes: reaction",
  description:
    "Create a DM Analysis ticket (assigned to Pratik) for the message",
  source_file: "functions/handle_analysis.ts",
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

export default SlackFunction(
  HandleAnalysisFunction,
  async ({ inputs, client, env }) => {
    const { channel_id, message_ts, reacting_user_id } = inputs;
    const route = config.analysisRoute;

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

    // Literal-:eyes: guard. Slack's reaction_added event normalizes a custom
    // emoji that is an *alias* of :eyes: (e.g. :eye-twitch-twitch:) to the
    // target name "eyes", so the trigger filter ({{data.reaction}} == 'eyes')
    // fires for aliases too and the event never carries the alias name. The
    // stored message reaction keeps the literal name, so this is the only place
    // we can require the real emoji. Proceed only when the reacting user put an
    // actual :eyes: on the message; anything else (an alias, or a reaction
    // already removed) bails silently. Note: conversations.history caps each
    // reaction's `users` list, so on a very high-count :eyes: the reactor may
    // not appear and a legit ticket would be skipped — acceptable here, these
    // reactions are near-always count 1.
    const reactions =
      (message as { reactions?: Array<{ name?: string; users?: string[] }> })
        .reactions ?? [];
    const addedLiteralEyes = reactions.some((r) =>
      r.name === config.analysisEmoji &&
      (r.users ?? []).includes(reacting_user_id)
    );
    if (!addedLiteralEyes) {
      console.log(
        `analysis: ignoring reaction from ${reacting_user_id} on ${message_ts} — ` +
          `no literal :${config.analysisEmoji}: from that user (likely an alias ` +
          `of :${config.analysisEmoji}:). Reactions present: ${
            reactions.map((r) => r.name).join(", ") || "none"
          }`,
      );
      return { outputs: {} };
    }

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

    // Dedupe: if the message already names a DM ticket, link to it instead of
    // opening a second one.
    const existingMatch = text.match(route.ticketKeyRegex);
    if (existingMatch) {
      const key = existingMatch[0].toUpperCase();
      if (await issueExists(env, key)) {
        try {
          await addRemoteSlackLink(env, key, {
            url: permalink,
            title: `Slack message (flagged by ${reactorName})`,
          });
        } catch (e) {
          console.error("addRemoteSlackLink failed", e);
        }
        try {
          await withTimeout(
            client.chat.postMessage({
              channel: channel_id,
              thread_ts: message_ts,
              text:
                `:link: Linked Slack to existing *${key}*: ${env.JIRA_BASE_URL}/browse/${key}`,
            }),
            SLACK_TIMEOUTS.postMessage,
            "chat.postMessage (linked analysis)",
          );
        } catch (e) {
          console.error("post linked-ticket reply failed", e);
        }
        return { outputs: {} };
      }
    }

    const firstLine = text.split("\n")[0].slice(0, 200) || "Slack message";
    const summary = firstLine.length < text.length
      ? `${firstLine}…`
      : firstLine;

    const description = buildSlackSourcedDescription({
      reactorDisplayName: reactorName,
      permalink,
      originalText: text,
      channelName,
    });

    const fields: Record<string, unknown> = {
      project: { key: route.projectKey },
      issuetype: { id: route.issueTypeId },
      summary,
      description,
    };

    let created: { key: string; id: string };
    try {
      created = await createIssueWithFields(env, fields);
    } catch (e) {
      console.error("createIssue (analysis) failed", e);
      await client.chat.postEphemeral({
        channel: channel_id,
        user: reacting_user_id,
        text: `Couldn't open a DM Analysis ticket: ${(e as Error).message}`,
      });
      return { outputs: {} };
    }

    // Best-effort assign. A missing permission shouldn't lose the ticket.
    let assignNote = "assigned to Pratik";
    try {
      const assign = await assignIssue(
        env,
        created.key,
        route.assigneeAccountId,
      );
      if (!assign.assigned) {
        console.error("assignIssue (analysis) failed", assign.reason);
        assignNote = "could not auto-assign — please set the assignee";
      }
    } catch (e) {
      console.error("assignIssue (analysis) threw", e);
      assignNote = "could not auto-assign — please set the assignee";
    }

    try {
      await addRemoteSlackLink(env, created.key, {
        url: permalink,
        title: channelName
          ? `Slack message in #${channelName}`
          : "Slack source message",
      });
    } catch (e) {
      console.error("addRemoteSlackLink failed", e);
    }

    try {
      await withTimeout(
        client.chat.postMessage({
          channel: channel_id,
          thread_ts: message_ts,
          text: `:eyes: Opened *${created.key}* (Analysis, ${assignNote}): ` +
            `${env.JIRA_BASE_URL}/browse/${created.key}`,
        }),
        SLACK_TIMEOUTS.postMessage,
        "chat.postMessage (new analysis ticket)",
      );
    } catch (e) {
      console.error("post new-analysis-ticket reply failed", e);
    }

    return { outputs: {} };
  },
);
