import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";

export class StringSelectMenuOptionBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {};

  setLabel(label: string): this {
    this.data["label"] = label;
    return this;
  }

  setValue(value: string): this {
    this.data["value"] = value;
    return this;
  }

  setDescription(description: string): this {
    this.data["description"] = description;
    return this;
  }

  setDefault(isDefault = true): this {
    this.data["default"] = isDefault;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
