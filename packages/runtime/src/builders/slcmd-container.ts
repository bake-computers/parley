import type { JsonObject } from "~/types/index.js";
import { OptionContainer } from "./option-container.js";
import { SlashCommandSubcommand } from "./subcommand.js";
import { SlashCommandSubcommandGroup } from "./subcommand-group.js";

export class SlashCommandOptionContainer extends OptionContainer {
  addSubcommand(input: (option: SlashCommandSubcommand) => SlashCommandSubcommand): this {
    return this.addOption(new SlashCommandSubcommand(), input);
  }

  addSubcommandGroup(
    input: (option: SlashCommandSubcommandGroup) => SlashCommandSubcommandGroup,
  ): this {
    return this.addOption(new SlashCommandSubcommandGroup(), input);
  }

  getOptionsJson(): JsonObject[] {
    return this.optionJson();
  }
}
