import { GlassPanel } from "#/components/ui/glass-panel";
import { useMessages } from "#/lib/content/messages/use-messages";
import { cn } from "#/lib/shared/cn";

type Player = {
  callsign: string;
  ratingBalanced: number;
};

const PLAYERS_ALPHA: Player[] = [
  { callsign: "VIGIL-7", ratingBalanced: 2600 },
  { callsign: "ASH-12", ratingBalanced: 2550 },
  { callsign: "SMOKE-3", ratingBalanced: 2500 },
  { callsign: "JAGER-9", ratingBalanced: 2460 },
];

const PLAYERS_BRAVO: Player[] = [
  { callsign: "THATCH-4", ratingBalanced: 2555 },
  { callsign: "MUTE-11", ratingBalanced: 2530 },
  { callsign: "CASTLE-2", ratingBalanced: 2505 },
  { callsign: "DOC-6", ratingBalanced: 2450 },
];

const RATING_MIN = 1800;
const RATING_MAX = 2900;

function avgRating(players: Player[]) {
  const total = players.reduce((sum, player) => sum + player.ratingBalanced, 0);

  return Math.round(total / players.length);
}

function ratingToPct(rating: number) {
  const percentage = ((rating - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;

  return Math.max(0, Math.min(100, percentage));
}

function TeamColumn({
  label,
  players,
  playersAria,
}: {
  label: string;
  players: Player[];
  playersAria: string;
}) {
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <span className="font-sans text-sm font-medium text-zinc-400">{label}</span>

        <span className="font-sans text-sm tabular-nums text-zinc-200">
          {avgRating(players).toLocaleString()}
        </span>
      </div>

      <ul
        className="flex flex-1 flex-col justify-between gap-4"
        aria-label={`${label} ${playersAria}`}
      >
        {players.map((player) => {
          const rating = player.ratingBalanced;

          return (
            <li key={player.callsign}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-sans text-zinc-400">{player.callsign}</span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={cn(
                    "h-full origin-left rounded-full bg-zinc-300/90",
                    "shadow-[0_0_8px_rgba(212,212,216,0.12)]",
                    "transition-[width] duration-700 ease-out",
                    "motion-reduce:transition-none",
                  )}
                  style={{ width: `${ratingToPct(rating)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HeroLobbyDemo() {
  const m = useMessages();
  const lb = m.home.lobby;
  return (
    <GlassPanel
      className={cn(
        "w-full overflow-hidden",
        "border-white/[0.1] bg-[#111216]",
        "shadow-[0_24px_70px_rgba(0,0,0,0.4)]",
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 md:p-6">
        <div
          className={cn(
            "min-h-[230px] rounded-2xl p-5",
            "border border-white/[0.06] bg-[#191a20]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]",
            "md:min-h-[250px] md:p-6",
          )}
        >
          <TeamColumn label={lb.teamAlpha} players={PLAYERS_ALPHA} playersAria={lb.playersAria} />
        </div>

        <div
          className={cn(
            "min-h-[230px] rounded-2xl p-5",
            "border border-white/[0.06] bg-[#191a20]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]",
            "md:min-h-[250px] md:p-6",
          )}
        >
          <TeamColumn label={lb.teamBeta} players={PLAYERS_BRAVO} playersAria={lb.playersAria} />
        </div>
      </div>
    </GlassPanel>
  );
}
