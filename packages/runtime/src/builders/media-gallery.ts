import { ComponentType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";

export class MediaGalleryBuilder implements JSONEncodable<JsonObject> {
  private items: JsonObject[] = [];

  addImage(url: string, description?: string): this {
    const item: JsonObject = { media: { url } };
    if (description !== undefined) {
      item["description"] = description;
    }
    this.items.push(item);
    return this;
  }

  toJSON(): JsonObject {
    return {
      type: ComponentType.MediaGallery,
      items: [...this.items],
    };
  }
}
