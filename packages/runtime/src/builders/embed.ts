import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";

export class EmbedBuilder implements JSONEncodable<APIEmbed & JsonObject> {
  private data: APIEmbed & JsonObject = {};

  constructor(data: APIEmbed = {}) {
    this.data = { ...(data as APIEmbed & JsonObject) };
  }

  setTitle(title: string): this {
    this.data.title = title;
    return this;
  }

  setDescription(description: string): this {
    this.data.description = description;
    return this;
  }

  setColor(color: number): this {
    this.data.color = color;
    return this;
  }

  setURL(url: string): this {
    this.data.url = url;
    return this;
  }

  setTimestamp(timestamp: Date | string | number = new Date()): this {
    this.data.timestamp =
      timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
    return this;
  }

  setFooter(footer: { text: string; icon_url?: string }): this {
    this.data.footer = footer;
    return this;
  }

  setImage(image: { url: string }): this {
    this.data.image = image;
    return this;
  }

  setThumbnail(thumbnail: { url: string }): this {
    this.data.thumbnail = thumbnail;
    return this;
  }

  addFields(...fields: APIEmbedField[]): this {
    this.data.fields = [...(this.data.fields ?? []), ...fields];
    return this;
  }

  toJSON(): APIEmbed & JsonObject {
    return { ...this.data };
  }
}
