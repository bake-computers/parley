import { ComponentType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";
import { StringSelectMenuOptionBuilder } from "./select-option.js";

export class StringSelectMenuBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.StringSelect,
    options: [],
  };

  setCustomId(customId: string): this {
    this.data['custom_id'] = customId;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.data['placeholder'] = placeholder;
    return this;
  }

  setMinValues(minValues: number): this {
    this.data['min_values'] = minValues;
    return this;
  }

  setMaxValues(maxValues: number): this {
    this.data['max_values'] = maxValues;
    return this;
  }

  setDisabled(disabled = true): this {
    this.data['disabled'] = disabled;
    return this;
  }

  addOptions(...options: StringSelectMenuOptionBuilder[]): this {
    const current = Array.isArray(this.data['options']) ? this.data['options'] : [];
    this.data['options'] = [...current, ...options.map((option) => option.toJSON())];
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
