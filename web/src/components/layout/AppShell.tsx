import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { BarChart3, LogOut, RefreshCw, Settings, User } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useTimerTitle } from "@/lib/use-timer-title";
import { Inbox } from "./Inbox";

/** Top bar + Jira inbox sidebar + the routed main area. */
export function AppShell() {
  const viewer = useQuery(api.settings.viewer);
  const ensureDefaults = useMutation(api.settings.ensureDefaults);
  const { signOut } = useAuthActions();
  useTimerTitle();

  const syncAction = useAction(api.jira.syncMyTickets);
  const [syncing, setSyncing] = useState(false);
  const autoSynced = useRef(false);

  useEffect(() => {
    void ensureDefaults();
  }, [ensureDefaults]);

  const sync = useCallback(
    async (auto: boolean) => {
      setSyncing(true);
      try {
        const r = await syncAction({ auto });
        if (!r.skipped && !auto) {
          toast.success(`Synced: ${r.added} new, ${r.updated} updated${r.archived ? `, ${r.archived} archived` : ""}`);
        }
      } catch (err) {
        toast.error(errorMessage(err, "Jira sync failed. Try again."));
      } finally {
        setSyncing(false);
      }
    },
    [syncAction],
  );

  // Auto-sync once per app load; the server skips it if the last sync was under 5 minutes ago.
  const jiraConnected = viewer?.jiraConnected ?? false;
  useEffect(() => {
    if (!jiraConnected || autoSynced.current) return;
    autoSynced.current = true;
    void sync(true);
  }, [jiraConnected, sync]);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none", isActive && "bg-accent text-foreground");

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Link to="/" className="mr-2 flex items-center gap-2 font-semibold">
          <img src="/favicon.svg?v=2" alt="" className="size-6" />
          Karya
        </Link>
        <NavLink to="/calibrate" className={navClass}>
          <BarChart3 className="size-4" /> Calibrate
        </NavLink>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          disabled={!jiraConnected || syncing}
          title={jiraConnected ? "Fetch your open Jira tickets" : "Connect Jira in Settings to sync"}
          onClick={() => void sync(false)}
        >
          <RefreshCw className={cn(syncing && "animate-spin")} /> {syncing ? "Syncing" : "Sync"}
        </Button>
        <NavLink to="/settings" className={navClass} aria-label="Settings">
          <Settings className="size-4" /> Settings
        </NavLink>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="User menu" />}>
            <User />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal text-muted-foreground">{viewer?.email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => void signOut()}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="flex min-h-0 flex-1">
        <Inbox />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
