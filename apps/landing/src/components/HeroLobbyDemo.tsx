import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

type Player = {
  callsign: string;
  ratingImbalanced: number;
  ratingBalanced: number;
};

const PLAYERS_ALPHA: Player[] = [
  { callsign: "VIGIL-7", ratingImbalanced: 2840, ratingBalanced: 2480 },
  { callsign: "ASH-12", ratingImbalanced: 2710, ratingBalanced: 2380 },
  { callsign: "SMOKE-3", ratingImbalanced: 2680, ratingBalanced: 2320 },
  { callsign: "JAGER-9", ratingImbalanced: 2620, ratingBalanced: 2280 },
];

const PLAYERS_BRAVO: Player[] = [
  { callsign: "THATCH-4", ratingImbalanced: 2100, ratingBalanced: 2420 },
  { callsign: "MUTE-11", ratingImbalanced: 1980, ratingBalanced: 2340 },
  { callsign: "CASTLE-2", ratingImbalanced: 1920, ratingBalanced: 2280 },
  { callsign: "DOC-6", ratingImbalanced: 1880, ratingBalanced: 2240 },
];

const RATING_MIN = 1800;
const RATING_MAX = 2900;
const SCORE_IMBALANCED = 38;
const SCORE_BALANCED = 94;
const AUTO_BALANCE_DELAY_MS = 1200;
const BALANCE_TRANSITION_MS = 800;

type Phase = "imbalanced" | "balancing" | "balanced";

function avgRating(players: Player[], balanced: boolean) {
  const total = players.reduce(
    (sum, p) => sum + (balanced ? p.ratingBalanced : p.ratingImbalanced),
    0,
  );
  return Math.round(total / players.length);
}

function ratingToPct(rating: number) {
  return ((rating - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;
}

function TeamColumn({
  label,
  players,
  balanced,
  animating,
}: {
  label: string;
  players: Player[];
  balanced: boolean;
  animating: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-xs text-foreground">
          {avgRating(players, balanced).toLocaleString()}
        </span>
      </div>
      <ul className="space-y-2.5" aria-label={`${label} players`}>
        {players.map((player) => {
          const rating = balanced ? player.ratingBalanced : player.ratingImbalanced;
          return (
            <li key={player.callsign}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-muted-foreground">{player.callsign}</span>
                <span
                  className={cn(
                    "font-mono tabular-nums transition-colors duration-500",
                    balanced ? "text-[#c0c5ce]" : "text-foreground",
                  )}
                >
                  {rating.toLocaleString()}
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden bg-border/60">
                <div
                  className={cn(
                    "h-full origin-left bg-[#c0c5ce] transition-transform duration-700 ease-out motion-reduce:transition-none",
                    animating && balanced && "animate-[parley-bar_0.7s_ease-out_forwards]",
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
  const [phase, setPhase] = useState<Phase>("imbalanced");
  const [displayScore, setDisplayScore] = useState(SCORE_IMBALANCED);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasAutoPlayedRef = useRef(false);

  const isBalanced = phase === "balanced" || phase === "balancing";
  const isAnimating = phase === "balancing";

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const runBalanceSequence = useCallback(
    (startDelay: number) => {
      clearTimers();

      const t1 = setTimeout(() => {
        setPhase("balancing");
        setDisplayScore(SCORE_BALANCED);
      }, startDelay);

      const t2 = setTimeout(() => {
        setPhase("balanced");
      }, startDelay + BALANCE_TRANSITION_MS);

      timersRef.current = [t1, t2];
    },
    [clearTimers],
  );

  const resetToImbalanced = useCallback(() => {
    setPhase("imbalanced");
    setDisplayScore(SCORE_IMBALANCED);
  }, []);

  const handleRebalance = useCallback(() => {
    if (isAnimating) {
      return;
    }
    resetToImbalanced();
    runBalanceSequence(400);
  }, [isAnimating, resetToImbalanced, runBalanceSequence]);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(prefersReduced);

    if (prefersReduced) {
      setPhase("balanced");
      setDisplayScore(SCORE_BALANCED);
      return;
    }

    if (!hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      runBalanceSequence(AUTO_BALANCE_DELAY_MS);
    }

    return clearTimers;
  }, [clearTimers, runBalanceSequence]);

  const statusLabel =
    phase === "imbalanced" ? "Unbalanced" : phase === "balancing" ? "Balancing…" : "Balanced";

  const liveMessage =
    phase === "balanced"
      ? "Lobby balanced. Teams are skill-matched."
      : phase === "balancing"
        ? "Balancing teams by skill rating."
        : "Lobby unbalanced. High skill delta detected.";

  return (
    <div className="border border-border/60 bg-secondary/20" aria-live="polite" aria-atomic="true">
      <span className="sr-only">{liveMessage}</span>

      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Lobby Status
        </span>
        <span className="flex items-center gap-2 font-mono text-xs">
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors duration-500",
              phase === "imbalanced" ? "bg-muted-foreground" : "bg-[#c0c5ce]",
              phase === "balanced" && "parley-balance-pulse",
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              "uppercase tracking-wider transition-colors duration-500",
              isBalanced ? "text-[#c0c5ce]" : "text-muted-foreground",
            )}
          >
            {statusLabel}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border/60">
        <div className="bg-background p-4 md:p-5">
          <TeamColumn
            label="Team α"
            players={PLAYERS_ALPHA}
            balanced={isBalanced}
            animating={isAnimating}
          />
        </div>
        <div className="bg-background p-4 md:p-5">
          <TeamColumn
            label="Team β"
            players={PLAYERS_BRAVO}
            balanced={isBalanced}
            animating={isAnimating}
          />
        </div>
      </div>

      <div className="space-y-4 border-t border-border/60 p-5">
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono uppercase tracking-wider text-muted-foreground">
              Balance score
            </span>
            <span
              className={cn(
                "font-mono text-sm tabular-nums transition-colors duration-500",
                isBalanced ? "text-[#c0c5ce]" : "text-foreground",
              )}
            >
              <span className="parley-count-up">{displayScore}</span>
              <span className="text-muted-foreground">/100</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden bg-border/60">
            <div
              className={cn(
                "h-full origin-left bg-[#c0c5ce] transition-[width] duration-700 ease-out motion-reduce:transition-none",
                isBalanced && !reducedMotion && "parley-shimmer",
              )}
              style={{ width: `${displayScore}%` }}
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isAnimating}
          onClick={handleRebalance}
          className="w-full border-border/70 bg-transparent text-foreground hover:bg-secondary/50"
        >
          <RefreshCw
            className={cn("size-3.5", isAnimating && "motion-safe:animate-spin")}
            aria-hidden="true"
          />
          Rebalance lobby
        </Button>

        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          Illustrative preview. Live matchmaking runs inside the Discord app at launch.
        </p>
      </div>
    </div>
  );
}
