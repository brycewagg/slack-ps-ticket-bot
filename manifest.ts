import { Manifest } from "deno-slack-sdk/mod.ts";
import { AckReactionWorkflow } from "./workflows/ack_reaction.ts";
import { DoneReactionWorkflow } from "./workflows/done_reaction.ts";
import { MuteThreadWorkflow } from "./workflows/mute_thread.ts";
import { SyncThreadCommentWorkflow } from "./workflows/sync_thread_comment.ts";
import { HandleAckFunction } from "./functions/handle_ack.ts";
import { HandleDoneFunction } from "./functions/handle_done.ts";
import { MuteThreadFunction } from "./functions/mute_thread.ts";
import { SyncThreadCommentFunction } from "./functions/sync_thread_comment.ts";
import { ThreadTicketDatastore } from "./datastores/thread_ticket_map.ts";

export default Manifest({
  name: "PI Ticket Bot",
  description: "Open, comment on, and close Performance Investigation tickets via Slack",
  icon: "assets/icon.png",
  workflows: [
    AckReactionWorkflow,
    DoneReactionWorkflow,
    MuteThreadWorkflow,
    SyncThreadCommentWorkflow,
  ],
  functions: [
    HandleAckFunction,
    HandleDoneFunction,
    MuteThreadFunction,
    SyncThreadCommentFunction,
  ],
  datastores: [ThreadTicketDatastore],
  outgoingDomains: ["mntn.atlassian.net"],
  botScopes: [
    "chat:write",
    "chat:write.public",
    "channels:history",
    "channels:read",
    "groups:history",
    "groups:read",
    "reactions:read",
    "users:read",
    "users:read.email",
    "triggers:write",
    "datastore:read",
    "datastore:write",
  ],
});
