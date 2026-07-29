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
    (sum, player) =>
      sum + (balanced ? player.ratingBalanced : player.ratingImbalanced),
    0,
  );

  return Math.round(total / players.length);
}

function ratingToPct(rating: number) {
  const percentage = ((rating - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;

  return Math.max(0, Math.min(100, percentage));
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
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <span className="font-sans text-sm font-medium text-zinc-400">
          {label}
        </span>

        <span className="font-sans text-sm tabular-nums text-zinc-200">
          {avgRating(players, balanced).toLocaleString()}
        </span>
      </div>

      <ul
        className="flex flex-1 flex-col justify-between gap-4"
        aria-label={`${label} ${playersAria}`}
      >
        {players.map((player) => {
          const rating = balanced
            ? player.ratingBalanced
            : player.ratingImbalanced;

          return (
            <li key={player.callsign}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-sans text-zinc-400">
                  {player.callsign}
                </span>

                <span
                  className={cn(
                    "font-sans tabular-nums transition-colors duration-500",
                    balanced ? "text-zinc-200" : "text-zinc-300",
                  )}
                >
                  {rating.toLocaleString()}
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={cn(
                    "h-full origin-left rounded-full bg-zinc-300/90",
                    "shadow-[0_0_8px_rgba(212,212,216,0.12)]",
                    "transition-[width] duration-700 ease-out",
                    "motion-reduce:transition-none",
                    animating &&
                      balanced &&
                      "animate-[parley-bar_0.7s_ease-out_forwards]",
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

      const startTimer = setTimeout(() => {
        setPhase("balancing");
        setDisplayScore(SCORE_BALANCED);
      }, startDelay);

      const finishTimer = setTimeout(() => {
        setPhase("balanced");
      }, startDelay + BALANCE_TRANSITION_MS);

      timersRef.current = [startTimer, finishTimer];
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
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    setReducedMotion(prefersReducedMotion);

    if (prefersReducedMotion) {
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
    <GlassPanel
      className={cn(
        "w-full overflow-hidden",
        "border-white/[0.1] bg-[#111216]",
        "shadow-[0_24px_70px_rgba(0,0,0,0.4)]",
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">{liveMessage}</span>

      <div
        className={cn(
          "flex items-center justify-between",
          "border-b border-white/[0.07]",
          "bg-white/[0.015] px-5 py-4 md:px-6",
        )}
      >
        <span className="text-sm font-medium text-zinc-400">
          {lb.statusHeader}
        </span>

        <span className="flex items-center gap-2 font-sans text-xs">
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors duration-500",
              phase === "imbalanced"
                ? "bg-amber-400"
                : phase === "balancing"
                  ? "bg-sky-400"
                  : "bg-emerald-400",
              phase === "balanced" && "parley-balance-pulse",
            )}
            aria-hidden="true"
          />

          <span
            className={cn(
              "font-medium transition-colors duration-500",
              phase === "imbalanced"
                ? "text-amber-300"
                : phase === "balancing"
                  ? "text-sky-300"
                  : "text-emerald-300",
            )}
          >
            {statusLabel}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 md:p-6">
        <div
          className={cn(
            "min-h-[230px] rounded-2xl p-5",
            "border border-white/[0.06] bg-[#191a20]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]",
            "md:min-h-[250px] md:p-6",
          )}
        >
          <TeamColumn
            label={lb.teamAlpha}
            players={PLAYERS_ALPHA}
            balanced={isBalanced}
            animating={isAnimating}
            playersAria={lb.playersAria}
          />
        </div>

        <div
          className={cn(
            "min-h-[230px] rounded-2xl p-5",
            "border border-white/[0.06] bg-[#191a20]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]",
            "md:min-h-[250px] md:p-6",
          )}
        >
          <TeamColumn
            label={lb.teamBeta}
            players={PLAYERS_BRAVO}
            balanced={isBalanced}
            animating={isAnimating}
            playersAria={lb.playersAria}
          />
        </div>
      </div>

      <div
        className={cn(
          "space-y-5 border-t border-white/[0.07]",
          "bg-black/[0.08] p-5 md:p-6",
        )}
      >
        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-sans text-sm font-medium text-zinc-400">
              {lb.balanceScore}
            </span>

            <span
              className={cn(
                "font-sans text-sm tabular-nums transition-colors duration-500",
                phase === "balanced"
                  ? "text-emerald-300"
                  : phase === "balancing"
                    ? "text-sky-300"
                    : "text-zinc-200",
              )}
            >
              <span className="parley-count-up">{displayScore}</span>
              <span className="text-zinc-500">/100</span>
            </span>
          </div>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className={cn(
                "h-full origin-left rounded-full",
                "transition-[width,background-color] duration-700 ease-out",
                "motion-reduce:transition-none",
                phase === "imbalanced"
                  ? "bg-zinc-400"
                  : phase === "balancing"
                    ? "bg-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.2)]"
                    : "bg-gradient-to-r from-emerald-400 to-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.2)]",
                isBalanced && !reducedMotion && "opacity-95",
              )}
              style={{ width: `${displayScore}%` }}
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={isAnimating}
          onClick={handleRebalance}
          className={cn(
            "h-11 w-full rounded-full",
            "border-white/[0.1] bg-white/[0.025]",
            "text-zinc-200",
            "hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white",
            "disabled:opacity-50",
          )}
        >
          <RefreshCw
            className={cn("size-4", isAnimating && "motion-safe:animate-spin")}
            aria-hidden="true"
          />

          {lb.rebalance}
        </Button>
      </div>
    </GlassPanel>
  );
}
