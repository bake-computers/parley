import { ApplicationCommandOptionType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import type { JSONEncodable } from "./types.js";
import { OptionContainer } from "./option-container.js";
import { SlashCommandSubcommand } from "./subcommand.js";

export class SlashCommandSubcommandGroup
  extends OptionContainer
  implements JSONEncodable<JsonObject>
{
  private data: JsonObject = {
    type: ApplicationCommandOptionType.SubcommandGroup,
  };

  setName(name: string): this {
    this.data['name'] = name;
    return this;
  }

  setDescription(description: string): this {
    this.data['description'] = description;
    return this;
  }

  addSubcommand(input: (option: SlashCommandSubcommand) => SlashCommandSubcommand): this {
    return this.addOption(new SlashCommandSubcommand(), input);
  }

  toJSON(): JsonObject {
    return {
      ...this.data,
      ...(this.options.length > 0 ? { options: this.optionJson() } : {}),
    };
  }
}
