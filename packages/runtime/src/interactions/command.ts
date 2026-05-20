import {
  ApplicationCommandType,
  type APIApplicationCommandInteraction,
} from "discord-api-types/v10";
import { ModalCapableInteraction } from "./modal-capable.js";

export class CommandInteraction<
  Raw extends APIApplicationCommandInteraction = APIApplicationCommandInteraction,
> extends ModalCapableInteraction<Raw> {
  get commandName(): string {
    return this.raw.data.name;
  }

  get commandId(): string {
    return this.raw.data.id;
  }

  get commandType(): ApplicationCommandType {
    return this.raw.data.type;
  }
}
