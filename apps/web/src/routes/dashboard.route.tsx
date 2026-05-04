import { createFileRoute, Outlet } from "@tanstack/react-router";
import { authClient } from "#/lib/auth";
import { Button } from "#/components/ui/button";
import { Loader2, Shield } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-blue" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-depth-2 flex items-center justify-center border border-white/10">
            <Shield className="h-8 w-8 text-accent-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dashboard Access</h1>
            <p className="text-muted-foreground mt-2 max-w-sm">
              Sign in with Discord to manage your servers and view their settings.
            </p>
          </div>
          <Button
            variant="gradient"
            size="lg"
            onClick={() => {
              authClient.signIn.social({ provider: "discord" });
            }}
          >
            Sign in with Discord
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  );
}
