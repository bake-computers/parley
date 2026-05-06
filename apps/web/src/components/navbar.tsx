import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Menu01Icon,
  Cancel01Icon,
  Link02Icon,
  Login01Icon,
  Logout02Icon,
  UserIcon,
  DashboardSquare01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "./ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { authClient } from "#/lib/auth";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="depth-panel border-b border-white/5">
        <div className="lp-container flex items-center justify-between h-14 md:h-16">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="text-lg md:text-xl font-bold tracking-tight gradient-text">
              PARLEY
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link
              to="/"
              activeProps={{ className: "text-foreground" }}
              inactiveProps={{
                className: "text-muted-foreground hover:text-foreground transition-colors",
              }}
              className="text-sm font-medium"
            >
              Home
            </Link>
            <Link
              to="/leaderboard"
              activeProps={{ className: "text-foreground" }}
              inactiveProps={{
                className: "text-muted-foreground hover:text-foreground transition-colors",
              }}
              className="text-sm font-medium"
            >
              Leaderboard
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {session?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <div className="flex items-center gap-2 rounded-full p-1 pr-3 hover:bg-white/5 transition-colors cursor-pointer">
                    <Avatar size="sm">
                      {session.user.image ? (
                        <AvatarImage src={session.user.image} alt={session.user.name ?? "User"} />
                      ) : null}
                      <AvatarFallback>
                        <HugeiconsIcon icon={UserIcon} strokeWidth={2} className="size-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground">
                      {session.user.name ?? "User"}
                    </span>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/dashboard" })}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon
                      icon={DashboardSquare01Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      authClient.signOut();
                      window.location.reload();
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <HugeiconsIcon icon={Logout02Icon} strokeWidth={2} className="size-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" variant="default">
                <Link to="/dashboard" className="gap-1.5">
                  <HugeiconsIcon icon={Login01Icon} strokeWidth={2} className="size-3.5" />
                  Log in
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <a
                href="https://discord.com/oauth2/authorize?client_id=PLACEHOLDER"
                target="_blank"
                rel="noopener noreferrer"
                className="gap-1.5"
              >
                Add to Discord
                <HugeiconsIcon icon={Link02Icon} strokeWidth={2} className="size-3.5" />
              </a>
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
            ) : (
              <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-5" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 border-b border-white/5 depth-panel animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="lp-container py-4 flex flex-col gap-1">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              Home
            </Link>
            <Link
              to="/leaderboard"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              Leaderboard
            </Link>
            <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-2">
              {session?.user ? (
                <>
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    <HugeiconsIcon
                      icon={DashboardSquare01Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      authClient.signOut();
                      window.location.reload();
                    }}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors text-left"
                  >
                    <HugeiconsIcon icon={Logout02Icon} strokeWidth={2} className="size-4" />
                    Log out
                  </button>
                </>
              ) : (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  <HugeiconsIcon icon={Login01Icon} strokeWidth={2} className="size-4" />
                  Log in
                </Link>
              )}
              <Button asChild size="sm" variant="outline" className="w-full">
                <a
                  href="https://discord.com/oauth2/authorize?client_id=PLACEHOLDER"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5"
                >
                  Add to Discord
                  <HugeiconsIcon icon={Link02Icon} strokeWidth={2} className="size-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
