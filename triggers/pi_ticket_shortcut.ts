import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import { PiTicketWorkflow } from "../workflows/pi_ticket.ts";

// Lightning-bolt (⚡) shortcut next to the Slack composer.
// After `slack trigger create`, this appears in the shortcuts menu in every channel
// where the app is installed.
const trigger: Trigger<typeof PiTicketWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "File PI Ticket",
  description: "Open a Performance Investigation ticket in PS",
  workflow: `#/workflows/${PiTicketWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: { value: TriggerContextData.Shortcut.interactivity },
    channel_id: { value: TriggerContextData.Shortcut.channel_id },
  },
};

export default trigger;
