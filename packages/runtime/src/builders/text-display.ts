import { ComponentType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";

export class TextDisplayBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.TextDisplay,
  };

  setContent(content: string): this {
    this.data['content'] = content;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
