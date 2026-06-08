import { ButtonStyle, ComponentType, type APIMessageComponentEmoji } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import { type JSONEncodable, encodeValue } from "./types.js";

export class ButtonBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.Button,
  };

  setCustomId(customId: string): this {
    this.data["custom_id"] = customId;
    return this;
  }

  setLabel(label: string): this {
    this.data["label"] = label;
    return this;
  }

  setStyle(style: ButtonStyle): this {
    this.data["style"] = style;
    return this;
  }

  setURL(url: string): this {
    this.data["url"] = url;
    return this;
  }

  setEmoji(emoji: APIMessageComponentEmoji): this {
    this.data["emoji"] = encodeValue(emoji);
    return this;
  }

  setDisabled(disabled = true): this {
    this.data["disabled"] = disabled;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
