import { err, ok, type Result } from "neverthrow";
import { discordRequest } from "./rest.js";
import {
  flattenHandlers,
  isRegisterableApplicationCommand,
  type AnyHandler,
} from "~/utils/handlers/index.js";
import type {
  DiscordApiError,
  JsonObject,
  RegisterOptions,
  RegisterSummary,
} from "~/types/index.js";

function collectCommands(handlers: readonly AnyHandler[]): {
  globalCommands: JsonObject[];
  guildCommands: Record<string, JsonObject[]>;
} {
  const globalCommands: JsonObject[] = [];
  const guildCommands: Record<string, JsonObject[]> = {};

  for (const handler of flattenHandlers(handlers)) {
    if (!isRegisterableApplicationCommand(handler)) {
      continue;
    }

    if (handler.isGuildCommand()) {
      const json = handler.toJSON();
      for (const guildId of handler.guildIds) {
        guildCommands[guildId] ??= [];
        guildCommands[guildId].push(json);
      }
    } else {
      globalCommands.push(handler.toJSON());
    }
  }

  return { globalCommands, guildCommands };
}

export function registerApplicationCommands(
  token: string | undefined,
  applicationId: string | undefined,
  ...handlers: AnyHandler[]
): Promise<Result<RegisterSummary, DiscordApiError>> {
  return registerApplicationCommandsWithOptions(token, applicationId, {}, ...handlers);
}

export async function registerApplicationCommandsWithOptions(
  token: string | undefined,
  applicationId: string | undefined,
  options: RegisterOptions,
  ...handlers: AnyHandler[]
): Promise<Result<RegisterSummary, DiscordApiError>> {
  if (!token || !applicationId) {
    return err({
      kind: "discord-api",
      method: "PUT",
      path: "/applications/:applicationId/commands",
      message: "Discord bot token or application ID is missing",
      retryable: false,
    });
  }

  const { globalCommands, guildCommands } = collectCommands(handlers);

  const globalResult = await discordRequest({
    method: "PUT",
    path: `/applications/${applicationId}/commands`,
    body: globalCommands,
    token,
    ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
    ...(options.apiBaseUrl === undefined ? {} : { apiBaseUrl: options.apiBaseUrl }),
  });
  if (globalResult.isErr()) {
    return err(globalResult.error);
  }

  const guildCommandCounts: Record<string, number> = {};
  const guildResults = await Promise.all(
    Object.entries(guildCommands).map(async ([guildId, commands]) => {
      const guildResult = await discordRequest({
        method: "PUT",
        path: `/applications/${applicationId}/guilds/${guildId}/commands`,
        body: commands,
        token,
        ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
        ...(options.apiBaseUrl === undefined ? {} : { apiBaseUrl: options.apiBaseUrl }),
      });
      return { guildId, commands, guildResult };
    }),
  );

  for (const { guildId, commands, guildResult } of guildResults) {
    if (guildResult.isErr()) {
      return err(guildResult.error);
    }
    guildCommandCounts[guildId] = commands.length;
  }

  return ok({
    globalCommandCount: globalCommands.length,
    guildCommandCounts,
  });
}
