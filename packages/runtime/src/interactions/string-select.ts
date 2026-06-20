import type { APIMessageStringSelectInteractionData } from "discord-api-types/v10";
import { MessageComponentInteraction } from "./component.js";

export class StringSelectInteraction extends MessageComponentInteraction {
  get values(): readonly string[] {
    return (this.raw.data as APIMessageStringSelectInteractionData).values;
  }
}
