import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "#/lib/utils";
import { SettingsInput } from "./SettingsField";

type Props = {
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: readonly string[];
  invalid?: boolean;
  placeholder?: string;
  /** Comma-separated tokens (e.g. platforms). */
  multi?: boolean;
};

function selectedTokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function filterOptions(
  value: string | null | undefined,
  options: readonly string[],
  multi: boolean,
): string[] {
  const text = value ?? "";
  if (multi) {
    const picked = new Set(selectedTokens(text));
    const token = text.split(",").pop()?.trim().toLowerCase() ?? "";
    return options.filter(
      (opt) => !picked.has(opt.toLowerCase()) && opt.toLowerCase().startsWith(token),
    );
  }
  const q = text.trim().toLowerCase();
  if (!q) {
    return [...options];
  }
  return options.filter((opt) => opt.toLowerCase().includes(q));
}

function applySelection(value: string, option: string, multi: boolean): string {
  if (!multi) {
    return option;
  }
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...parts, option].join(", ");
}

export function AutocompleteInput({
  value,
  onChange,
  options,
  invalid,
  placeholder,
  multi = false,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const text = value ?? "";

  const suggestions = useMemo(
    () => filterOptions(text, options, multi),
    [multi, options, text],
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
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const pick = (option: string) => {
    onChange(applySelection(value, option, multi));
    setOpen(false);
  };

  const showMenu = open && suggestions.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <SettingsInput
        value={text}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (e.key === "Escape") {
            setOpen(false);
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
            const option = suggestions[activeIndex];
            if (option) {
              pick(option);
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
          className="glass-panel absolute top-[calc(100%+0.35rem)] z-20 max-h-44 w-full overflow-y-auto rounded-xl p-1 shadow-lg"
        >
          {suggestions.map((option, index) => (
            <li key={option} role="option" aria-selected={index === activeIndex}>
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
                onClick={() => pick(option)}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}