import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "#/components/ui/button";
import { GlassPanel } from "#/components/ui/glass-panel";
import { useMessages } from "#/lib/content/messages/use-messages";
import { cn } from "#/lib/shared/cn";

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
  playersAria,
}: {
  label: string;
  players: Player[];
  balanced: boolean;
  animating: boolean;
  playersAria: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-xs text-foreground">
          {avgRating(players, balanced).toLocaleString()}
        </span>
      </div>
      <ul className="space-y-2.5" aria-label={`${label} ${playersAria}`}>
        {players.map((player) => {
          const rating = balanced ? player.ratingBalanced : player.ratingImbalanced;
          return (
            <li key={player.callsign}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-muted-foreground">{player.callsign}</span>
                <span
                  className={cn(
                    "font-mono tabular-nums transition-colors duration-500",
                    balanced ? "text-accent-silver" : "text-foreground",
                  )}
                >
                  {rating.toLocaleString()}
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border/60">
                <div
                  className={cn(
                    "h-full origin-left rounded-full bg-accent-silver transition-transform duration-700 ease-out motion-reduce:transition-none",
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
  const m = useMessages();
  const lb = m.home.lobby;
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
    phase === "imbalanced"
      ? lb.statusUnbalanced
      : phase === "balancing"
        ? lb.statusBalancing
        : lb.statusBalanced;

  const liveMessage =
    phase === "balanced"
      ? lb.liveBalanced
      : phase === "balancing"
        ? lb.liveBalancing
        : lb.liveUnbalanced;

  return (
    <GlassPanel className="overflow-hidden" aria-live="polite" aria-atomic="true">
      <span className="sr-only">{liveMessage}</span>

      <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
        <span className="text-sm font-medium text-muted-foreground">{lb.statusHeader}</span>
        <span className="flex items-center gap-2 font-mono text-xs">
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors duration-500",
              phase === "imbalanced" ? "bg-muted-foreground" : "bg-accent-silver",
              phase === "balanced" && "parley-balance-pulse",
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              "font-medium transition-colors duration-500",
              isBalanced ? "text-accent-silver" : "text-muted-foreground",
            )}
          >
            {statusLabel}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 md:p-5">
        <div className="rounded-2xl bg-muted/30 p-4">
          <TeamColumn
            label={lb.teamAlpha}
            players={PLAYERS_ALPHA}
            balanced={isBalanced}
            animating={isAnimating}
            playersAria={lb.playersAria}
          />
        </div>
        <div className="rounded-2xl bg-muted/30 p-4">
          <TeamColumn
            label={lb.teamBeta}
            players={PLAYERS_BRAVO}
            balanced={isBalanced}
            animating={isAnimating}
            playersAria={lb.playersAria}
          />
        </div>
      </div>

      <div className="space-y-4 border-t border-border/40 p-5">
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-medium text-muted-foreground">{lb.balanceScore}</span>
            <span
              className={cn(
                "font-mono text-sm tabular-nums transition-colors duration-500",
                isBalanced ? "text-accent-silver" : "text-foreground",
              )}
            >
              <span className="parley-count-up">{displayScore}</span>
              <span className="text-muted-foreground">/100</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
            <div
              className={cn(
                "h-full origin-left rounded-full bg-accent-silver transition-[width] duration-700 ease-out motion-reduce:transition-none",
                isBalanced && !reducedMotion && "opacity-90",
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
          className="w-full rounded-full border-border/70 bg-transparent text-foreground hover:bg-secondary/50"
        >
          <RefreshCw
            className={cn("size-3.5", isAnimating && "motion-safe:animate-spin")}
            aria-hidden="true"
          />
          {lb.rebalance}
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground/70">{lb.footnote}</p>
      </div>
    </GlassPanel>
  );
}
