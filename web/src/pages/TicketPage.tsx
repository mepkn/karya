import { NavLink, Navigate, Outlet, useParams } from "react-router";
import { TABS, useTicket } from "@/lib/ticket-tabs";
import { useQuery } from "convex/react";
import { ExternalLink, Lock } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function TicketPage() {
  const { jiraKey = "" } = useParams();
  const ticket = useQuery(api.tickets.getByKey, { jiraKey });

  if (ticket === undefined) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (ticket === null) {
    return <p className="p-6 text-muted-foreground">Ticket {jiraKey} not found.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 pt-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono">{ticket.jiraKey}</span>
          {ticket.jiraUrl && (
            <a href={ticket.jiraUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              Open in Jira <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <h1 className="mt-1 text-lg font-semibold">{ticket.summary}</h1>
        <nav className="mt-3 flex gap-1" aria-label="Ticket tabs">
          {TABS.map((tab) =>
            tab.unlocked(ticket) ? (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  cn(
                    "border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    isActive && "border-primary text-foreground",
                  )
                }
              >
                {tab.label}
              </NavLink>
            ) : (
              <span key={tab.path} title={tab.lockedHint} className="inline-flex cursor-not-allowed items-center gap-1 px-3 py-2 text-sm text-muted-foreground/50">
                <Lock className="size-3" /> {tab.label}
              </span>
            ),
          )}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <Outlet context={ticket} />
      </div>
    </div>
  );
}

/** Redirects a locked tab back to Estimate. */
export function RequireUnlocked({ tab, children }: { tab: "execute" | "calibrate"; children: React.ReactNode }) {
  const ticket = useTicket();
  const def = TABS.find((t) => t.path === tab)!;
  return def.unlocked(ticket) ? children : <Navigate to="../estimate" replace />;
}
