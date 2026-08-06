import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { DiscordMarkdown } from "./markdown.js";
import { accentStyle, cn, formatFileSize, resolveAvatar } from "./utils.js";

type DivProps = HTMLAttributes<HTMLDivElement>;

/* ── Messages / Message ── */

export type DiscordMessagesProps = DivProps & {
  theme?: "dark" | "light";
  children?: ReactNode;
};

export function DiscordMessages({
  theme = "dark",
  className,
  children,
  ...rest
}: DiscordMessagesProps) {
  return (
    <div className={cn("djs-root", className)} data-theme={theme} {...rest}>
      <div className="djs-messages">{children}</div>
    </div>
  );
}

export type DiscordMessageProps = DivProps & {
  author?: string;
  avatar?: string;
  /** Shows the blue APP badge (Components v2 / application messages). */
  app?: boolean;
  /** Legacy bot badge (same visual as app). */
  bot?: boolean;
  roleColor?: string;
  timestamp?: string;
  children?: ReactNode;
};

export function DiscordMessage({
  author = "Bot",
  avatar,
  app,
  bot,
  roleColor,
  timestamp,
  className,
  children,
  style,
  ...rest
}: DiscordMessageProps) {
  const src = resolveAvatar(avatar);
  const isApp = app || bot;
  const authorStyle: CSSProperties | undefined = roleColor
    ? { ["--djs-role-color" as string]: roleColor, color: roleColor }
    : undefined;

  return (
    <div className={cn("djs-message", className)} style={style} {...rest}>
      {src ? (
        <img className="djs-avatar" src={src} alt="" width={40} height={40} />
      ) : (
        <div className="djs-avatar djs-avatar-fallback" aria-hidden>
          {author.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="djs-message-body">
        <div className="djs-message-header">
          <span className="djs-author" style={authorStyle}>
            {author}
          </span>
          {isApp ? (
            <span className="djs-badge">
              <AppBadgeIcon />
              APP
            </span>
          ) : null}
          {timestamp ? <span className="djs-timestamp">{timestamp}</span> : null}
        </div>
        <div className="djs-message-content">{children}</div>
      </div>
    </div>
  );
}

function AppBadgeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M12.1 5.1a.9.9 0 0 0-1.3 0L7.5 8.4 5.2 6.1a.9.9 0 1 0-1.3 1.3l2.9 2.9c.4.4 1 .4 1.3 0l4-4a.9.9 0 0 0 0-1.3Z" />
    </svg>
  );
}

/* ── Container ── */

export type DiscordContainerProps = DivProps & {
  /** RGB int (0x5865F2) or CSS color string. */
  accentColor?: number | string | null;
  spoiler?: boolean;
  children?: ReactNode;
};

export function DiscordContainer({
  accentColor,
  spoiler,
  className,
  style,
  children,
  ...rest
}: DiscordContainerProps) {
  const accent = accentStyle(accentColor);
  return (
    <div
      className={cn("djs-container", className)}
      data-accent={accentColor != null ? "true" : undefined}
      data-spoiler={spoiler ? "true" : undefined}
      style={{ ...accent, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── Section ── */

export type DiscordSectionProps = DivProps & {
  accessory?: ReactNode;
  children?: ReactNode;
};

export function DiscordSection({
  accessory,
  className,
  children,
  ...rest
}: DiscordSectionProps) {
  return (
    <div className={cn("djs-section", className)} {...rest}>
      <div className="djs-section-content">{children}</div>
      {accessory != null ? (
        <div className="djs-section-accessory">{accessory}</div>
      ) : null}
    </div>
  );
}

/* ── Text Display ── */

export type DiscordTextDisplayProps = DivProps & {
  /** Discord markdown content. Prefer this over children for string content. */
  content?: string;
  children?: ReactNode;
};

export function DiscordTextDisplay({
  content,
  className,
  children,
  ...rest
}: DiscordTextDisplayProps) {
  return (
    <div className={cn("djs-text", className)} {...rest}>
      {content != null ? <DiscordMarkdown content={content} /> : children}
    </div>
  );
}

/* ── Separator ── */

export type DiscordSeparatorProps = DivProps & {
  divider?: boolean;
  /** 1 = small, 2 = large (Discord API). */
  spacing?: 1 | 2 | "small" | "large";
};

export function DiscordSeparator({
  divider = true,
  spacing = 1,
  className,
  ...rest
}: DiscordSeparatorProps) {
  const size =
    spacing === 2 || spacing === "large" ? "large" : "small";
  return (
    <div
      className={cn("djs-separator", className)}
      data-spacing={size}
      {...rest}
    >
      {divider ? <hr className="djs-separator-line" /> : null}
    </div>
  );
}

/* ── Action Row ── */

export type DiscordActionRowProps = DivProps & {
  children?: ReactNode;
};

export function DiscordActionRow({
  className,
  children,
  ...rest
}: DiscordActionRowProps) {
  return (
    <div className={cn("djs-action-row", className)} {...rest}>
      {children}
    </div>
  );
}

/* ── Button ── */

export type DiscordButtonStyle =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "link"
  | "premium"
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6;

const BUTTON_STYLE_MAP: Record<string | number, string> = {
  1: "primary",
  2: "secondary",
  3: "success",
  4: "danger",
  5: "link",
  6: "premium",
  primary: "primary",
  secondary: "secondary",
  success: "success",
  danger: "danger",
  link: "link",
  premium: "premium",
};

export type DiscordButtonProps = {
  style?: DiscordButtonStyle;
  label?: string;
  emoji?: string;
  url?: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
};

export function DiscordButton({
  style = "primary",
  label,
  emoji,
  url,
  disabled,
  className,
  children,
  onClick,
}: DiscordButtonProps) {
  const kind = BUTTON_STYLE_MAP[style] ?? "primary";
  const content = (
    <>
      {emoji ? (
        emoji.startsWith("http") || emoji.startsWith("/") ? (
          <img className="djs-button-emoji" src={emoji} alt="" />
        ) : (
          <span className="djs-button-emoji" aria-hidden>
            {emoji}
          </span>
        )
      ) : null}
      <span>{children ?? label}</span>
      {kind === "link" ? <LinkIcon /> : null}
    </>
  );

  if (kind === "link" && url) {
    return (
      <a
        className={cn("djs-button", className)}
        data-style={kind}
        data-disabled={disabled ? "true" : undefined}
        href={disabled ? undefined : url}
        target="_blank"
        rel="noreferrer"
        aria-disabled={disabled}
        onClick={disabled ? (e) => e.preventDefault() : onClick}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={cn("djs-button", className)}
      data-style={kind}
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function LinkIcon() {
  return (
    <svg className="djs-button-link-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 5V3h11v11h-2V6.4l-11.8 11.8-1.4-1.4L17.6 5H10Z" />
    </svg>
  );
}

/* ── Selects ── */

export type DiscordSelectOption = {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  default?: boolean;
};

export type DiscordSelectProps = {
  type?: "string" | "user" | "role" | "mentionable" | "channel";
  placeholder?: string;
  options?: DiscordSelectOption[];
  value?: string;
  disabled?: boolean;
  className?: string;
  /** Show a static closed control (default). Set true for a simple open menu in docs demos. */
  interactive?: boolean;
  onChange?: (value: string) => void;
};

const DEFAULT_PLACEHOLDERS: Record<NonNullable<DiscordSelectProps["type"]>, string> = {
  string: "Make a selection",
  user: "Select users",
  role: "Select roles",
  mentionable: "Select options",
  channel: "Select channels",
};

export function DiscordSelect({
  type = "string",
  placeholder,
  options = [],
  value,
  disabled,
  className,
  interactive = false,
  onChange,
}: DiscordSelectProps) {
  const defaultOpt = options.find((o) => o.default);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(
    value ?? defaultOpt?.value ?? "",
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (value !== undefined) setSelected(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selectedOpt = options.find((o) => o.value === selected);
  const label =
    selectedOpt?.label ??
    placeholder ??
    DEFAULT_PLACEHOLDERS[type];
  const hasValue = Boolean(selectedOpt);

  return (
    <div className={cn("djs-select-wrap", className)} ref={wrapRef}>
      <button
        type="button"
        className="djs-select"
        data-has-value={hasValue ? "true" : "false"}
        data-disabled={disabled ? "true" : undefined}
        disabled={disabled}
        aria-haspopup={interactive ? "listbox" : undefined}
        aria-expanded={interactive ? open : undefined}
        aria-controls={interactive ? listId : undefined}
        onClick={() => {
          if (!interactive || disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="djs-select-label">{label}</span>
        <ChevronIcon />
      </button>
      {interactive && open && options.length > 0 ? (
        <div className="djs-select-menu" role="listbox" id={listId}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              className="djs-select-option"
              data-selected={opt.value === selected ? "true" : undefined}
              aria-selected={opt.value === selected}
              onClick={() => {
                setSelected(opt.value);
                onChange?.(opt.value);
                setOpen(false);
              }}
            >
              <span className="djs-select-option-label">
                {opt.emoji ? `${opt.emoji} ` : null}
                {opt.label}
              </span>
              {opt.description ? (
                <span className="djs-select-option-desc">{opt.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DiscordStringSelect(props: Omit<DiscordSelectProps, "type">) {
  return <DiscordSelect {...props} type="string" />;
}

export function DiscordUserSelect(props: Omit<DiscordSelectProps, "type" | "options">) {
  return <DiscordSelect {...props} type="user" />;
}

export function DiscordRoleSelect(props: Omit<DiscordSelectProps, "type" | "options">) {
  return <DiscordSelect {...props} type="role" />;
}

export function DiscordMentionableSelect(
  props: Omit<DiscordSelectProps, "type" | "options">,
) {
  return <DiscordSelect {...props} type="mentionable" />;
}

export function DiscordChannelSelect(
  props: Omit<DiscordSelectProps, "type" | "options">,
) {
  return <DiscordSelect {...props} type="channel" />;
}

function ChevronIcon() {
  return (
    <svg className="djs-select-chevron" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 10l5 5 5-5H7z" />
    </svg>
  );
}

/* ── Thumbnail ── */

export type DiscordThumbnailProps = {
  url: string;
  description?: string;
  spoiler?: boolean;
  className?: string;
};

export function DiscordThumbnail({
  url,
  description,
  spoiler,
  className,
}: DiscordThumbnailProps) {
  return (
    <img
      className={cn("djs-thumbnail", className)}
      src={url}
      alt={description ?? ""}
      data-spoiler={spoiler ? "true" : undefined}
      width={80}
      height={80}
    />
  );
}

/* ── Media Gallery ── */

export type DiscordMediaGalleryItem = {
  url: string;
  description?: string;
  spoiler?: boolean;
};

export type DiscordMediaGalleryProps = DivProps & {
  items: DiscordMediaGalleryItem[];
};

export function DiscordMediaGallery({
  items,
  className,
  ...rest
}: DiscordMediaGalleryProps) {
  const count = Math.min(Math.max(items.length, 1), 10);
  return (
    <div
      className={cn("djs-gallery", className)}
      data-count={String(count)}
      {...rest}
    >
      {items.slice(0, 10).map((item, i) => (
        <div
          key={i}
          className="djs-gallery-item"
          data-spoiler={item.spoiler ? "true" : undefined}
        >
          <img src={item.url} alt={item.description ?? ""} />
        </div>
      ))}
    </div>
  );
}

/* ── File ── */

export type DiscordFileProps = DivProps & {
  name: string;
  size?: number;
  spoiler?: boolean;
};

export function DiscordFile({
  name,
  size,
  spoiler,
  className,
  ...rest
}: DiscordFileProps) {
  const ext = name.includes(".") ? name.split(".").pop()!.slice(0, 4) : "file";
  return (
    <div
      className={cn("djs-file", className)}
      data-spoiler={spoiler ? "true" : undefined}
      {...rest}
    >
      <div className="djs-file-icon">{ext}</div>
      <div className="djs-file-meta">
        <span className="djs-file-name">{name}</span>
        {size != null ? (
          <span className="djs-file-size">{formatFileSize(size)}</span>
        ) : null}
      </div>
    </div>
  );
}

/* ── Mention ── */

export type DiscordMentionProps = {
  type?: "user" | "role" | "channel";
  color?: string;
  className?: string;
  children?: ReactNode;
};

export function DiscordMention({
  type = "user",
  color,
  className,
  children,
}: DiscordMentionProps) {
  const style: CSSProperties | undefined = color
    ? { ["--djs-mention-color" as string]: color }
    : undefined;
  const fallback =
    type === "channel" ? "channel" : type === "role" ? "role" : "User";
  return (
    <span
      className={cn("djs-mention", className)}
      data-type={type}
      style={style}
    >
      {children ?? fallback}
    </span>
  );
}
