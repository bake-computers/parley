import { Button } from "#/components/ui/button";

export function Footer() {
  return (
    <footer className="lp-section border-t border-border/50">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Ready to compete?</h3>
          <p className="text-muted-foreground mt-1">
            Add Parley to your Discord server and start tracking competitive Siege.
          </p>
        </div>
        <Button asChild size="lg">
          <a
            href="https://discord.com/oauth2/authorize?client_id=PLACEHOLDER"
            target="_blank"
            rel="noopener noreferrer"
          >
            Add Parley to Discord
          </a>
        </Button>
      </div>
      <div className="mt-12 pt-6 border-t border-border/30 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <p>Parley — Competitive Siege, Made Simple</p>
        <p>&copy; {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}
