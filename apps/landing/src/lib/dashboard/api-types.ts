export type { GuildSettingsBundleJson, SettingsSection } from "./guild/types.js";

export type PatchBody = {
  section: import("./guild/types.js").SettingsSection;
  payload: unknown;
};
