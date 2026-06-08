import { ComponentType, SeparatorSpacingSize } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";

export class SeparatorBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.Separator,
  };

  setDivider(divider = true): this {
    this.data["divider"] = divider;
    return this;
  }

  setSpacing(spacing: SeparatorSpacingSize): this {
    this.data["spacing"] = spacing;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}
