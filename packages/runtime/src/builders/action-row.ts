import { ComponentType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";

export class ActionRowBuilder<
  Component extends JSONEncodable = JSONEncodable,
> implements JSONEncodable<JsonObject> {
  private components: Component[] = [];

  addComponents(...components: Component[]): this {
    this.components.push(...components);
    return this;
  }

  toJSON(): JsonObject {
    return {
      type: ComponentType.ActionRow,
      components: this.components.map((component) => component.toJSON()),
    };
  }
}
