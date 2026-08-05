interface FigureProps {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

function Figure({ src, alt, caption, width, height }: FigureProps) {
  return (
    <figure className="my-8">
      <div className="overflow-hidden rounded-xl border border-border/70">
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className="h-auto w-full"
        />
      </div>
      <figcaption className="mt-2.5 text-center text-xs text-muted-foreground/70">{caption}</figcaption>
    </figure>
  );
}

export function DiscordGuideContentEn() {
  return (
    <div className="max-w-none">
      <p>
        Parley lives entirely inside Discord. You never configure a website or manage a server panel
        to play: every command is a slash command, every reply is a card only you can see, and your
        skill follows you across servers. This guide walks the whole loop in about five minutes.
      </p>

      <h2 id="what-parley-does">What Parley does on Discord</h2>
      <ul>
        <li>
          <strong>Links your Rainbow Six Siege account</strong> to your Discord identity, one profile
          per platform.
        </li>
        <li>
          <strong>Rates your skill</strong> with the Parley Rank, seeded from your Siege rank and
          moved by Parley matches.
        </li>
        <li>
          <strong>Builds balanced lobbies</strong> from everyone's real ratings, so teams are settled
          before the argument starts.
        </li>
        <li>
          <strong>Runs tournaments</strong> with a share code you join straight from chat.
        </li>
      </ul>

      <h2 id="add-parley">1 · Add Parley to your server</h2>
      <p>
        A server admin adds Parley from <a href="https://parley.bot">parley.bot</a>. It needs the
        Manage Server permission and nothing else — there is no channel setup, no roles, no
        configuration before players start using it.
      </p>
      <p>
        Every Parley reply is ephemeral: your accounts, settings, and match data never appear in the
        public channel.
      </p>

      <h2 id="link-your-account">2 · Link your account with /link</h2>
      <p>
        Type <code>/link</code> in any channel. The first time, Parley shows a welcome card: accept
        the terms and it continues straight into the linking wizard. Pick your platform, enter your
        exact in-game name, and confirm.
      </p>
      <Figure
        src="/assets/docs/link-wizard.svg"
        alt="The Parley link wizard as a Discord card: PC selected as the platform and an in-game name entered, with Continue and Go back buttons."
        caption="The /link wizard: pick a platform, type your in-game name, confirm."
        width={720}
        height={400}
      />
      <p>
        After a moment you get a <strong>You're Ready To Play</strong> card with your Parley Rank,
        your profile level, and your current Siege rank and RP. Full details, including what to do
        when a link fails, are on the{" "}
        <a href="/docs/getting-started/link-your-account">link your account</a> page.
      </p>

      <h2 id="check-your-rank">3 · Check your rank with /profile</h2>
      <p>
        Run <code>/profile</code> to see every linked account with its platform and its Parley Rank
        on each. The rank is Parley's own ladder — ten tiers from Iron to Challenger — and it moves
        only when you play Parley matches.
      </p>
      <Figure
        src="/assets/docs/profile-card.svg"
        alt="The Parley profile card as a Discord card: two linked platforms, each with its username and a Gold rank with points."
        caption="/profile lists each linked platform with its Parley Rank."
        width={720}
        height={330}
      />
      <p>
        The full ladder and how points move are on the{" "}
        <a href="/docs/ranks-and-stats/parley-rank">Parley Rank</a> page.
      </p>

      <h2 id="play-a-match">4 · Play a balanced match</h2>
      <p>
        When your server queues a match, Parley compares full rosters and picks the split with the
        closest win odds on both sides. You see the teams, the scoreboard, and after the result is
        reported, everyone's rating movement — including yours.
      </p>
      <Figure
        src="/assets/docs/balanced-teams.svg"
        alt="A Parley match card as a Discord card: Team A and Team B with five players and ratings each, and a balance meter showing even odds."
        caption="Teams come pre-balanced from everyone's Parley Rank."
        width={720}
        height={420}
      />
      <p>
        Recent results live in <code>/history</code>, and <code>/team</code> runs the same balance
        for custom lobbies you pick yourself. Both are covered in the{" "}
        <a href="/docs/commands">command reference</a>.
      </p>

      <h2 id="go-deeper">Go deeper</h2>
      <ul>
        <li>
          <a href="/docs/commands">Commands</a> — every slash command at a glance.
        </li>
        <li>
          <a href="/docs/matchmaking">Matchmaking</a> — how balance works and why you might be left
          out.
        </li>
        <li>
          <a href="/docs/tournaments">Tournaments</a> — create or join a bracket with a share code.
        </li>
        <li>
          <a href="/docs/privacy-and-data">Privacy and data</a> — what is stored and how to delete
          it.
        </li>
        <li>
          <a href="/docs/faq">FAQ</a> — quick answers to common questions.
        </li>
      </ul>
    </div>
  );
}
