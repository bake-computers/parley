import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatChannelLabel, type GuildTextChannel } from "#/lib/discord/guild-channels";
import { cn } from "#/lib/shared/cn";
import { SettingsInput } from "./SettingsField";

const VISIBLE_OPTIONS = 5;
const OPTION_ROW_REM = 2.25;

type Props = {
  value: string;
  onChange: (channelId: string) => void;
  channels: readonly GuildTextChannel[];
  invalid?: boolean;
  placeholder?: string;
  disabled?: boolean;
};

function filterChannels(query: string, channels: readonly GuildTextChannel[]): GuildTextChannel[] {
  const q = query.replace(/^#/, "").trim().toLowerCase();
  if (!q) {
    return [...channels];
  }
  return channels.filter((ch) => ch.name.toLowerCase().includes(q) || ch.id.includes(q));
}

export function ChannelAutocomplete({
  value,
  onChange,
  channels,
  invalid,
  placeholder = "Select a channel",
  disabled,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => channels.find((ch) => ch.id === value) ?? null, [channels, value]);

  const displayValue = open ? query : selected ? formatChannelLabel(selected) : value;

  const suggestions = useMemo(
    () => filterChannels(open ? query : "", channels),
    [channels, open, query],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const pick = (channel: GuildTextChannel) => {
    onChange(channel.id);
    setQuery("");
    setOpen(false);
  };

  const showMenu = open && suggestions.length > 0 && !disabled;

  return (
    <div ref={rootRef} className="relative">
      <SettingsInput
        value={displayValue}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery(selected ? selected.name : "");
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            return;
          }
          if (!suggestions.length) {
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % suggestions.length);
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          }
          if (e.key === "Enter" && showMenu) {
            e.preventDefault();
            const channel = suggestions[activeIndex];
            if (channel) {
              pick(channel);
            }
          }
        }}
        invalid={invalid}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={showMenu ? listId : undefined}
        aria-autocomplete="list"
      />

      {showMenu ? (
        <ul
          id={listId}
          role="listbox"
          className="glass-panel absolute top-[calc(100%+0.35rem)] z-20 w-full overflow-y-auto rounded-xl p-1 shadow-lg"
          style={{ maxHeight: `${VISIBLE_OPTIONS * OPTION_ROW_REM}rem` }}
        >
          {suggestions.map((channel, index) => (
            <li key={channel.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  index === activeIndex
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(channel)}
              >
                {formatChannelLabel(channel)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
