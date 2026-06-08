import { ComponentType, type APIMessageComponentInteraction } from "discord-api-types/v10";
import { ModalCapableInteraction } from "./modal-capable.js";

export class MessageComponentInteraction extends ModalCapableInteraction<APIMessageComponentInteraction> {
  get customId(): string {
    return this.raw.data.custom_id;
  }

  get componentType(): ComponentType {
    return this.raw.data.component_type;
  }
}
