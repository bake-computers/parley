import { Button } from "@/components/ui/button";
import { MessageCircle, Bell } from "lucide-react";

// Replace with the real invite once the server is public.
const DISCORD_URL = "https://discord.gg/parley";

export function DiscordCta() {
  return (
    <section id="discord" className="border-b border-border/60">
      <div className="mx-auto w-full max-w-3xl px-6 py-24 text-center md:py-32">
        <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Pre-launch Access
        </span>
        <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
          Join the Discord for launch updates.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-muted-foreground">
          Parley launches as a Discord app first, with a full web experience and Discord backward
          compatibility to follow. Hop into the server to get notified the moment the bot goes live.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            className="h-11 bg-foreground text-background transition-transform hover:-translate-y-0.5 hover:bg-foreground/90"
          >
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" aria-hidden="true" />
              Join the Discord
            </a>
          </Button>
        </div>

        <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-2 border border-border/70 bg-secondary/30 px-5 py-4">
          <Bell className="size-4 shrink-0 text-[#c0c5ce]" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Launch announcements drop in the server first. No account or signup required.
          </p>
        </div>

        <p className="mt-5 text-xs uppercase tracking-widest text-muted-foreground/60">
          Community updates · Discord app first
        </p>
      </div>
    </section>
  );
}