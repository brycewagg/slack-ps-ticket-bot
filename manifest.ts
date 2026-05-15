import { Manifest } from "deno-slack-sdk/mod.ts";
import { AckReactionWorkflow } from "./workflows/ack_reaction.ts";
import { DoneReactionWorkflow } from "./workflows/done_reaction.ts";
import { MuteThreadWorkflow } from "./workflows/mute_thread.ts";
import { SyncThreadCommentWorkflow } from "./workflows/sync_thread_comment.ts";
import { PiTicketWorkflow } from "./workflows/pi_ticket.ts";
import { HandleAckFunction } from "./functions/handle_ack.ts";
import { HandleDoneFunction } from "./functions/handle_done.ts";
import { MuteThreadFunction } from "./functions/mute_thread.ts";
import { SyncThreadCommentFunction } from "./functions/sync_thread_comment.ts";
import { CreatePiTicketFunction } from "./functions/create_pi_ticket.ts";
import { ThreadTicketDatastore } from "./datastores/thread_ticket_map.ts";

export default Manifest({
  name: "PS Ticket Bot",
  description: "Open, comment on, and close PS Jira tickets via Slack",
  icon: "assets/icon.png",
  workflows: [
    AckReactionWorkflow,
    DoneReactionWorkflow,
    MuteThreadWorkflow,
    SyncThreadCommentWorkflow,
    PiTicketWorkflow,
  ],
  functions: [
    HandleAckFunction,
    HandleDoneFunction,
    MuteThreadFunction,
    SyncThreadCommentFunction,
    CreatePiTicketFunction,
  ],
  datastores: [ThreadTicketDatastore],
  outgoingDomains: ["mntn.atlassian.net"],
  botScopes: [
    "commands",
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
