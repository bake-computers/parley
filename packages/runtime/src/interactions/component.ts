import {
  ComponentType,
  type APIMessageComponentInteraction,
  type APIMessageStringSelectInteractionData,
} from "discord-api-types/v10";
import { ModalCapableInteraction } from "./base.js";

export class MessageComponentInteraction extends ModalCapableInteraction<APIMessageComponentInteraction> {
  get customId(): string {
    return this.raw.data.custom_id;
  }

  get componentType(): ComponentType {
    return this.raw.data.component_type;
  }

  get messageId(): string | undefined {
    return this.raw.message?.id;
  }
}

/** Branded subclasses kept for `instanceof` routing at call sites. */
export class ButtonInteraction extends MessageComponentInteraction {}
export class UserSelectInteraction extends MessageComponentInteraction {}
export class RoleSelectInteraction extends MessageComponentInteraction {}
export class MentionableSelectInteraction extends MessageComponentInteraction {}
export class ChannelSelectInteraction extends MessageComponentInteraction {}

export class StringSelectInteraction extends MessageComponentInteraction {
  get values(): readonly string[] {
    return (this.raw.data as APIMessageStringSelectInteractionData).values;
  }
}
