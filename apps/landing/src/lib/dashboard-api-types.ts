export type {
  GuildSettingsBundleJson,
  SettingsSection,
} from "./guild-settings-types.js";

export type PatchBody = {
  section: import("./guild-settings-types.js").SettingsSection;
  payload: unknown;
};