import { ApplicationCommandOptionType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import { type JSONEncodable } from "./types.js";

export abstract class BaseCommandOptionBuilder implements JSONEncodable<JsonObject> {
  protected data: JsonObject;

  protected constructor(type: ApplicationCommandOptionType) {
    this.data = { type };
  }

  setName(name: string): this {
    this.data["name"] = name;
    return this;
  }

  setDescription(description: string): this {
    this.data["description"] = description;
    return this;
  }

  setRequired(required = true): this {
    this.data["required"] = required;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
