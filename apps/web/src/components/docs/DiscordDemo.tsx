import type { ReactNode } from "react";
import {
  DiscordMessage,
  DiscordMessages,
  type DiscordMessageProps,
} from "@parley/discord-components";
import "@parley/discord-components/styles.css";

/** Parley brand accent (matches bot UI_TOKENS.main graphite silver). */
export const DJS = {
  main: 0xb8b8bd,
  indigo: 0x6366f1,
  success: 0x22c55e,
  warning: 0xffb020,
  error: 0xff4d4d,
} as const;

const PARLEY_AVATAR = "/parley-logo.svg";

/**
 * Discord message shell for docs. Isolated styles; does not use the site design system.
 */
export function DiscordDemo({
  children,
  author = "Parley",
  app = true,
  avatar = PARLEY_AVATAR,
  timestamp = "Today at 12:00 PM",
  className,
}: {
  children?: ReactNode;
  author?: string;
  app?: boolean;
  avatar?: string;
  timestamp?: string;
  className?: string;
}) {
  const messageProps: DiscordMessageProps = {
    author,
    app,
    avatar,
    timestamp,
  };

  return (
    <div
      className={
        className ??
        "my-4 overflow-hidden rounded-xl border border-border/40 shadow-sm [&_.djs-root]:rounded-none"
      }
    >
      <DiscordMessages>
        <DiscordMessage {...messageProps}>{children}</DiscordMessage>
      </DiscordMessages>
    </div>
  );
}
