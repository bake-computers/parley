import { ComponentType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";

export class ThumbnailBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.Thumbnail,
  };

  setURL(url: string): this {
    this.data["media"] = { url };
    return this;
  }

  setDescription(description: string): this {
    this.data["description"] = description;
    return this;
  }

  setSpoiler(spoiler = true): this {
    this.data["spoiler"] = spoiler;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
