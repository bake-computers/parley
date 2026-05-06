import { useEffect, useState } from "react";
import { apiUrl } from "#/lib/api";

interface StatsData {
  totalPlayers: number;
  matchesToday: number;
  tournamentsCompleted: number;
  serverCount: number;
}

const STATS_REFRESH_INTERVAL_MS = 60_000;

function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M+`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K+`;
  }
  return value.toLocaleString();
}

function SkeletonCard() {
  return (
    <div className="community-stats__card depth-panel">
      <div className="community-stats__number skeleton-pulse" />
      <div className="community-stats__label skeleton-pulse" />
    </div>
  );
}

export function CommunityStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(apiUrl("/api/stats"), { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: StatsData = await res.json();
        setStats(data);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, STATS_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const statItems = [
    { key: "totalPlayers", label: "Total Players" },
    { key: "matchesToday", label: "Active Matches Today" },
    { key: "tournamentsCompleted", label: "Tournaments Completed" },
    { key: "serverCount", label: "Servers Using Parley" },
  ] as const;

  return (
    <section className="lp-section">
      <div className="mb-12">
        <p className="lp-label mb-2">Community</p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Trusted by <span className="gradient-text">thousands</span>
        </h2>
      </div>

      <div className="community-stats__grid">
        {loading
          ? statItems.map((item) => <SkeletonCard key={item.key} />)
          : statItems.map((item) => (
              <div key={item.key} className="community-stats__card depth-panel">
                <div className="community-stats__number">
                  {stats && stats[item.key] > 0 ? formatNumber(stats[item.key]) : "—"}
                </div>
                <div className="community-stats__label">{item.label}</div>
              </div>
            ))}
      </div>
    </section>
  );
}
