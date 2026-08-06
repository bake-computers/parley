import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  DiscordActionRow,
  DiscordButton,
  DiscordChannelSelect,
  DiscordContainer,
  DiscordFile,
  DiscordMediaGallery,
  DiscordMention,
  DiscordMessage,
  DiscordMessages,
  DiscordRoleSelect,
  DiscordSection,
  DiscordSeparator,
  DiscordStringSelect,
  DiscordTextDisplay,
  DiscordThumbnail,
  DiscordUserSelect,
} from "@parley/discord-components";
import "@parley/discord-components/styles.css";

export const Route = createFileRoute("/dev/discord-components")({
  head: () => ({
    meta: [
      { title: "Discord Components v2 preview — Parley" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DiscordComponentsPreview,
});

function DiscordComponentsPreview() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem 1rem",
        background: "#1a1b1e",
        color: "#dbdee1",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>
          @parley/discord-components
        </h1>
        <p style={{ color: "#949ba4", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
          Components v2 mock preview · /dev/discord-components
        </p>

        <Section title="Screenshot replica (Container + Section + selects)">
          <DiscordMessages>
            <DiscordMessage author="djs" app avatar="blue">
              <DiscordContainer accentColor={0x5865f2}>
                <DiscordTextDisplay content="This text is inside a Text Display component! You can use **any markdown** available inside this component too." />
                <DiscordActionRow>
                  <DiscordUserSelect placeholder="Select users" />
                </DiscordActionRow>
                <DiscordSection
                  accessory={
                    <DiscordButton style="primary">Button inside a Section</DiscordButton>
                  }
                >
                  <DiscordTextDisplay
                    content={`This text is inside a Text Display component! You can use **any markdown** available inside this component too.
And you can place one button or one thumbnail component next to it!`}
                  />
                </DiscordSection>
              </DiscordContainer>
            </DiscordMessage>
          </DiscordMessages>
        </Section>

        <Section title="Markdown (headings, lists, spoiler, code)">
          <DiscordMessages>
            <DiscordMessage author="Parley" app avatar="green" timestamp="Today at 12:00 PM">
              <DiscordContainer accentColor={0x57f287}>
                <DiscordTextDisplay
                  content={`# Text Display
All the regular markdown rules apply
- You can make lists
- You can use \`inline code\`
- You can use [links](https://parley.bot)
- Spoiler alert: ||click to reveal||

\`\`\`
code block
line two
\`\`\`

-# Subtext with -# prefix
> A blockquote line`}
                />
              </DiscordContainer>
            </DiscordMessage>
          </DiscordMessages>
        </Section>

        <Section title="Buttons + string select">
          <DiscordMessages>
            <DiscordMessage author="Parley" app avatar="orange">
              <DiscordContainer>
                <DiscordTextDisplay content="Pick a mode and confirm:" />
                <DiscordActionRow>
                  <DiscordStringSelect
                    interactive
                    placeholder="Favorite mode?"
                    options={[
                      { label: "Ranked", value: "ranked", description: "Competitive queues" },
                      { label: "Casual", value: "casual", emoji: "🎮" },
                      { label: "Custom", value: "custom", default: true },
                    ]}
                  />
                </DiscordActionRow>
                <DiscordActionRow>
                  <DiscordButton style="primary">Accept</DiscordButton>
                  <DiscordButton style="secondary">Maybe later</DiscordButton>
                  <DiscordButton style="success">Done</DiscordButton>
                  <DiscordButton style="danger">Decline</DiscordButton>
                  <DiscordButton style="link" url="https://parley.bot">
                    Docs
                  </DiscordButton>
                </DiscordActionRow>
              </DiscordContainer>
            </DiscordMessage>
          </DiscordMessages>
        </Section>

        <Section title="Section + thumbnail accessory">
          <DiscordMessages>
            <DiscordMessage author="Parley" app avatar="red">
              <DiscordContainer accentColor={0xed4245}>
                <DiscordSection
                  accessory={
                    <DiscordThumbnail url="https://cdn.discordapp.com/embed/avatars/2.png" />
                  }
                >
                  <DiscordTextDisplay content="# Real Game v7.3" />
                  <DiscordTextDisplay content="Hope you're excited — the update is finally here." />
                  <DiscordTextDisplay content="-# That last one wasn't real." />
                </DiscordSection>
              </DiscordContainer>
            </DiscordMessage>
          </DiscordMessages>
        </Section>

        <Section title="Separator, file, gallery, mentions">
          <DiscordMessages>
            <DiscordMessage author="Parley" bot avatar="pink">
              <DiscordTextDisplay content="It's dangerous to go alone!" />
              <DiscordSeparator divider spacing={2} />
              <DiscordTextDisplay content="Take this." />
              <DiscordFile name="game.zip" size={48_000_000} />
              <DiscordMediaGallery
                items={[
                  { url: "https://cdn.discordapp.com/embed/avatars/0.png", description: "A" },
                  { url: "https://cdn.discordapp.com/embed/avatars/1.png", description: "B" },
                  { url: "https://cdn.discordapp.com/embed/avatars/3.png", description: "C" },
                ]}
              />
              <DiscordTextDisplay>
                Welcome <DiscordMention>juwen</DiscordMention> and{" "}
                <DiscordMention type="role" color="#70f0b4">
                  Players
                </DiscordMention>{" "}
                — join <DiscordMention type="channel">matchmaking</DiscordMention>.
              </DiscordTextDisplay>
              <DiscordActionRow>
                <DiscordRoleSelect placeholder="Which roles?" />
              </DiscordActionRow>
              <DiscordActionRow>
                <DiscordChannelSelect placeholder="Which channel?" />
              </DiscordActionRow>
            </DiscordMessage>
          </DiscordMessages>
        </Section>

        <Section title="Light theme">
          <DiscordMessages theme="light">
            <DiscordMessage author="djs" app avatar="blue">
              <DiscordContainer accentColor={0x5865f2}>
                <DiscordTextDisplay content="Same components on **light** theme." />
                <DiscordActionRow>
                  <DiscordButton style="primary">Primary</DiscordButton>
                  <DiscordButton style="secondary">Secondary</DiscordButton>
                </DiscordActionRow>
              </DiscordContainer>
            </DiscordMessage>
          </DiscordMessages>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <h2
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#949ba4",
          marginBottom: "0.75rem",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
