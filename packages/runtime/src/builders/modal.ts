import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";
import { ActionRowBuilder } from "./action-row.js";

export class ModalBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    components: [],
  };

  setCustomId(customId: string): this {
    this.data['custom_id'] = customId;
    return this;
  }

  setTitle(title: string): this {
    this.data['title'] = title;
    return this;
  }

  addComponents(...components: ActionRowBuilder[]): this {
    const current = Array.isArray(this.data['components']) ? this.data['components'] : [];
    this.data['components'] = [...current, ...components.map((component) => component.toJSON())];
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
