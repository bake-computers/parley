import { ComponentType, TextInputStyle } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";

export class TextInputBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.TextInput,
  };

  setCustomId(customId: string): this {
    this.data["custom_id"] = customId;
    return this;
  }

  setLabel(label: string): this {
    this.data["label"] = label;
    return this;
  }

  setStyle(style: TextInputStyle): this {
    this.data["style"] = style;
    return this;
  }

  setRequired(required = true): this {
    this.data["required"] = required;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.data["placeholder"] = placeholder;
    return this;
  }

  setMinLength(minLength: number): this {
    this.data["min_length"] = minLength;
    return this;
  }

  setMaxLength(maxLength: number): this {
    this.data["max_length"] = maxLength;
    return this;
  }

  setValue(value: string): this {
    this.data["value"] = value;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
