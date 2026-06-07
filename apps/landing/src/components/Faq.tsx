const faqs = [
  {
    q: "Is Parley live yet?",
    a: "Not yet. Parley is in pre-launch. The Discord app is in development and hasn't been released — join the Discord to be notified the moment it goes live.",
  },
  {
    q: "How will I use Parley at launch?",
    a: "Parley launches as a Discord app first. You'll queue, form teams, run scrims, and join tournaments directly through Discord.",
  },
  {
    q: "Will there be a web app?",
    a: "Yes. A full web experience is planned after the Discord launch, with backward compatibility so your Discord setup keeps working seamlessly.",
  },
  {
    q: "What makes the matchmaking different?",
    a: "Instead of relying on win/loss alone, Parley's engine uses real in-game telemetry — aim, impact, role consistency, and recent form — to build genuinely balanced teams.",
  },
  {
    q: "Does it cost anything to join?",
    a: "No. Joining the Discord is free and only signs you up for launch updates and community announcements.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-b border-border/60">
      <div className="mx-auto w-full max-w-3xl px-6 py-20 md:py-28">
        <div className="text-center">
          <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">FAQ</span>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Questions, answered.
          </h2>
        </div>

        <dl className="mt-12 divide-y divide-border/60 border-y border-border/60">
          {faqs.map((item) => (
            <div key={item.q} className="py-6">
              <dt className="text-base font-medium text-foreground">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
