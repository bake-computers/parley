import { ApplicationCommandOptionType, ChannelType } from "discord-api-types/v10";
import { BaseCommandOptionBuilder } from "./option-base.js";

export class SlashCommandChannelOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Channel);
  }

  addChannelTypes(...channelTypes: ChannelType[]): this {
    this.data['channel_types'] = channelTypes;
    return this;
  }
}
