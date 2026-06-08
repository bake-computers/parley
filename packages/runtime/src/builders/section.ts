import { ComponentType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";
import { TextDisplayBuilder } from "./text-display.js";

export class SectionBuilder implements JSONEncodable<JsonObject> {
  private components: TextDisplayBuilder[] = [];
  private accessory?: JSONEncodable<JsonObject>;

  addText(...components: TextDisplayBuilder[]): this {
    this.components.push(...components);
    return this;
  }

  setAccessory(accessory: JSONEncodable<JsonObject>): this {
    this.accessory = accessory;
    return this;
  }

  toJSON(): JsonObject {
    const data: JsonObject = {
      type: ComponentType.Section,
      components: this.components.map((component) => component.toJSON()),
    };

    if (this.accessory) {
      data["accessory"] = this.accessory.toJSON();
    }

    return data;
  }
}
