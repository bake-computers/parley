import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "#/lib/shared/cn";

export type PickableMember = {
  id: string;
  name: string;
  avatarUrl: string;
};

type PlayerPickerProps = {
  code: string;
  currentUserId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  rosterSize?: number;
};

/** Searchable multi-select of host-guild members, replacing raw comma-separated Discord IDs. */
export function PlayerPicker({
  code,
  currentUserId,
  selectedIds,
  onChange,
  rosterSize,
}: PlayerPickerProps) {
  const [members, setMembers] = useState<PickableMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/tournaments/${encodeURIComponent(code)}/members`, { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as { members?: PickableMember[]; error?: string };
        if (!res.ok || !data.members) throw new Error(data.error ?? "Could not load members");
        if (!cancelled) setMembers(data.members);
      })
      .catch(
        (reason) =>
          !cancelled &&
          setError(reason instanceof Error ? reason.message : "Could not load members"),
      );
    return () => {
      cancelled = true;
    };
  }, [code]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!members) return [];
    return q ? members.filter((member) => member.name.toLowerCase().includes(q)) : members;
  }, [members, query]);

  function toggle(id: string) {
    if (id === currentUserId) return;
    onChange(
      selected.has(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id],
    );
  }

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search
          className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search server members…"
          className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 h-10 w-full rounded-lg border pl-9 pr-3 text-sm outline-none focus-visible:ring-3"
        />
      </div>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : members === null ? (
        <p className="text-muted-foreground py-4 text-center text-xs">Loading members…</p>
      ) : (
        <ul className="border-border/60 bg-background max-h-60 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
          {filtered.length === 0 ? (
            <li className="text-muted-foreground py-4 text-center text-xs">No members match</li>
          ) : (
            filtered.map((member) => {
              const isSelf = member.id === currentUserId;
              const isChecked = selected.has(member.id);
              return (
                <li key={member.id}>
                  <label
                    className={cn(
                      "hover:bg-muted/50 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                      isSelf && "cursor-default opacity-90",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isSelf}
                      onChange={() => toggle(member.id)}
                      className="size-4 accent-current"
                    />
                    <img
                      src={member.avatarUrl}
                      alt=""
                      loading="lazy"
                      className="size-6 shrink-0 rounded-full"
                    />
                    <span className="truncate">
                      {member.name}
                      {isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
                    </span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">
        {selectedIds.length} selected
        {rosterSize ? ` · rosters need ${rosterSize} player${rosterSize === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );
}
