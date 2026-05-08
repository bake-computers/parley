import { ComponentType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";

export class ContainerBuilder<
  Component extends JSONEncodable<JsonObject> = JSONEncodable<JsonObject>,
> implements JSONEncodable<JsonObject> {
  private components: Component[] = [];
  private accentColor?: number | null;
  private spoiler?: boolean;

  setAccentColor(accentColor: number | null): this {
    this.accentColor = accentColor;
    return this;
  }

  setSpoiler(spoiler = true): this {
    this.spoiler = spoiler;
    return this;
  }

  addComponents(...components: Component[]): this {
    this.components.push(...components);
    return this;
  }

  toJSON(): JsonObject {
    const data: JsonObject = {
      type: ComponentType.Container,
      components: this.components.map((component) => component.toJSON()),
    };

    if (this.accentColor !== undefined) {
      data['accent_color'] = this.accentColor;
    }

    if (this.spoiler !== undefined) {
      data['spoiler'] = this.spoiler;
    }

    return data;
  }
}
