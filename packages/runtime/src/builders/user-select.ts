import {
  ComponentType,
  SelectMenuDefaultValueType,
  type APISelectMenuDefaultValue,
} from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import { type JSONEncodable, encodeValue } from "./types.js";

export class UserSelectMenuBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.UserSelect,
  };

  setCustomId(customId: string): this {
    this.data["custom_id"] = customId;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.data["placeholder"] = placeholder;
    return this;
  }

  setMinValues(minValues: number): this {
    this.data["min_values"] = minValues;
    return this;
  }

  setMaxValues(maxValues: number): this {
    this.data["max_values"] = maxValues;
    return this;
  }

  setDisabled(disabled = true): this {
    this.data["disabled"] = disabled;
    return this;
  }

  setDefaultValues(...values: APISelectMenuDefaultValue<SelectMenuDefaultValueType.User>[]): this {
    this.data["default_values"] = encodeValue(values);
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
