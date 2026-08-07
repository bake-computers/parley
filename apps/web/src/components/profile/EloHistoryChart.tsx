import { useMemo } from "react";
import { areaY, defineChart, lineY } from "@tanstack/charts";
import { scaleLinear } from "@tanstack/charts-scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import type { RatingPointJson } from "#/lib/profile/rpc";
import { formatElo } from "#/lib/profile/parley-rank";

type ChartRow = {
  at: number;
  elo: number;
};

type EloHistoryChartProps = {
  points: RatingPointJson[];
};

function formatChartDate(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

export function EloHistoryChart({ points }: EloHistoryChartProps) {
  const rows = useMemo<ChartRow[]>(() => {
    return points.map((p) => ({
      at: p.recordedAtMs,
      elo: p.elo,
    }));
  }, [points]);

  const definition = useMemo(() => {
    if (rows.length === 0) {
      return null;
    }
    return defineChart({
      marks: [
        areaY(rows, {
          x: "at",
          y: "elo",
          fill: "color-mix(in oklab, var(--accent-silver) 18%, transparent)",
        }),
        lineY(rows, {
          x: "at",
          y: "elo",
          stroke: "var(--accent-silver)",
          strokeWidth: 2,
        }),
      ],
      x: {
        scale: scaleLinear,
        nice: true,
        axis: {
          ticks: {
            count: 4,
            format: (value: number) => formatChartDate(Number(value)),
          },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: {
          label: "Parley Rank",
          ticks: {
            format: (value: number) => formatElo(Number(value)),
          },
        },
      },
      tooltip,
    });
  }, [rows]);

  if (!definition || rows.length < 2) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
        {rows.length === 1
          ? `Current rank: ${formatElo(rows[0]!.elo)} — play matches to build history.`
          : "No rank history yet."}
      </div>
    );
  }

  return (
    <Chart
      definition={definition}
      height={280}
      initialWidth={720}
      ariaLabel="Parley rank history over time"
      className="w-full"
    />
  );
}
