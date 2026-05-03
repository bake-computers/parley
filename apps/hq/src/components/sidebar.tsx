import { useMemo } from "react";
import { Link, useParams, useLocation } from "@tanstack/react-router";
import {
  Home,
  Settings,
  Users,
  Swords,
  Trophy,
  ScrollText,
  Bell,
  Menu,
  X,
  Server,
  Globe,
  Shield,
} from "lucide-react";
import { cn } from "#/lib/utils";
import { useDashboard } from "#/components/dashboard-context";
import { useGuildAccess } from "#/hooks/use-guild-access";
import { Badge } from "#/components/ui/badge";

const navItems = [
  { label: "Home", icon: Home, href: "/" },
  { label: "Settings", icon: Settings, href: "/guild/$guildId/settings" },
  { label: "Players", icon: Users, href: "/guild/$guildId/players" },
  { label: "Match History", icon: Swords, href: "/guild/$guildId/matches" },
  { label: "Tournaments", icon: Trophy, href: "/guild/$guildId/tournaments" },
  { label: "Match Rules", icon: ScrollText, href: "/guild/$guildId/rules" },
  { label: "Notifications", icon: Bell, href: "/guild/$guildId/notifications" },
];

function guildIconUrl(guildId: string, iconHash: string): string {
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png`;
}

function resolveNavHref(href: string, guildId: string | null | undefined): string {
  if (href === "/") return "/";
  if (!guildId) return "/";
  return href.replace("$guildId", guildId);
}

export function Sidebar() {
  const { selectedGuildId, mobileSidebarOpen, setMobileSidebarOpen } = useDashboard();
  const params = useParams({ strict: false });
  const routeGuildId = params.guildId as string | undefined;
  const { adminGuilds, isGlobalAdmin } = useGuildAccess();
  const location = useLocation();

  const activeGuildId = routeGuildId ?? selectedGuildId ?? null;
  const activeGuild = useMemo(() => {
    if (!activeGuildId) return null;
    return adminGuilds.find((g) => g.id === activeGuildId) ?? null;
  }, [activeGuildId, adminGuilds]);

  const isAllServers = activeGuildId === null && isGlobalAdmin;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        className={cn(
          "fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-depth-1 text-white transition-colors hover:bg-white/10 lg:hidden",
          mobileSidebarOpen && "hidden",
        )}
        aria-label="Toggle navigation"
      >
        <Menu size={20} />
      </button>

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-white/[0.08] bg-depth-1 transition-transform duration-300 ease-[var(--ease-out)] lg:static lg:translate-x-0",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <Link
            to="/"
            search={{ period: "30d", server: "all", game: "all", feature: "all" }}
            className="flex items-center gap-2.5"
          >
            <span className="text-lg font-bold uppercase tracking-tight gradient-text">Parley</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-white/[0.08] px-5 py-4">
          {isAllServers ? (
            <div className="flex items-center gap-3">
              <div className="guild-card-avatar guild-card-avatar-fallback gradient-text flex h-9 w-9 items-center justify-center">
                <Globe size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">All Servers</p>
                <Badge variant="outline" className="mt-1 hq-badge text-[0.65rem]">
                  <Shield size={10} />
                  Global Admin
                </Badge>
              </div>
            </div>
          ) : activeGuild ? (
            <div className="flex items-center gap-3">
              {activeGuild.icon ? (
                <img
                  src={guildIconUrl(activeGuild.id, activeGuild.icon)}
                  alt=""
                  width={36}
                  height={36}
                  className="guild-card-avatar h-9 w-9"
                />
              ) : (
                <div className="guild-card-avatar guild-card-avatar-fallback flex h-9 w-9 items-center justify-center">
                  <Server size={18} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {activeGuild.name ?? activeGuild.id}
                </p>
                <span className="text-[0.7rem] uppercase tracking-wider text-white/50">Server</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="guild-card-avatar guild-card-avatar-fallback flex h-9 w-9 items-center justify-center">
                <Server size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/60">Select a server</p>
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const href = resolveNavHref(item.href, activeGuildId);
              const isActive =
                item.href === "/"
                  ? location.pathname === "/"
                  : activeGuildId
                    ? location.pathname.startsWith(href.replace(/\/$/, ""))
                    : false;

              return (
                <li key={item.label}>
                  <Link
                    to={href}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-gradient-to-r from-accent-blue/20 to-accent-cyan/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        : "text-white/60 hover:bg-white/[0.05] hover:text-white",
                    )}
                  >
                    <item.icon
                      size={18}
                      className={cn(
                        "shrink-0 transition-colors",
                        isActive ? "text-accent-cyan" : "text-white/40 group-hover:text-white/70",
                      )}
                    />
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/[0.08] px-5 py-3">
          <p className="text-[0.65rem] uppercase tracking-wider text-white/30">Parley HQ v1.0</p>
        </div>
      </aside>
    </>
  );
}
