const stats = [
  { value: "12,400+", label: "Total Players" },
  { value: "830", label: "Active Matches Today" },
  { value: "1,200+", label: "Tournaments Completed" },
  { value: "3,600+", label: "Servers Using Parley" },
];

export function CommunityStats() {
  return (
    <section className="lp-section">
      <div className="mb-12">
        <p className="lp-label mb-2">Community</p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Trusted by <span className="gradient-text">thousands</span>
        </h2>
      </div>

      <div className="community-stats__grid">
        {stats.map((stat) => (
          <div key={stat.label} className="community-stats__card depth-panel">
            <div className="community-stats__number">{stat.value}</div>
            <div className="community-stats__label">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
