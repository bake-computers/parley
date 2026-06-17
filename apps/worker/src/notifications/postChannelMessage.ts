import type { DiscordRestClient, DiscordApiError, JsonObject } from "@parley/runtime";
import type { ContainerBuilder, EmbedBuilder } from "@parley/runtime";
import type { Result } from "neverthrow";

// Components v2 flag (32768) — no ephemeral for public channel posts.
const COMPONENTS_V2_FLAG = 32768;

/**
 * Error codes / status codes that indicate the v2 component payload was
 * rejected and we should retry with an embed fallback.
 */
function isComponentRejection(error: DiscordApiError): boolean {
  // 400 Bad Request with component-related body, or 50013 / 50035
  // (Missing Permissions / Invalid Form Body) when components are unsupported.
  if (error.status === 400) {
    return true;
  }
  if (error.status === 403) {
    return true;
  }
  return false;
}

/**
 * Post a notification to a single Discord channel.
 *
 * Tries a Components v2 container first. If Discord rejects the payload
 * (component-related error), retries with the embed-only fallback.
 *
 * Returns the final result — ok on success, err if both attempts fail.
 */
export async function postChannelMessage(
  client: DiscordRestClient,
  channelId: string,
  container: ContainerBuilder,
  embed: EmbedBuilder,
): Promise<Result<unknown, DiscordApiError>> {
  // Attempt 1: v2 container
  const v2Body: JsonObject = {
    components: [container.toJSON()],
    flags: COMPONENTS_V2_FLAG,
  };

  const v2Result = await client.request("POST", `/channels/${channelId}/messages`, v2Body);

  if (v2Result.isOk()) {
    return v2Result;
  }

  // If the error is not component-related, propagate it.
  if (!isComponentRejection(v2Result.error)) {
    return v2Result;
  }

  // Attempt 2: embed fallback
  const embedBody: JsonObject = {
    embeds: [embed.toJSON()],
  };

  return client.request("POST", `/channels/${channelId}/messages`, embedBody);
}
