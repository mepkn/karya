import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@convex/_generated/api";

/** Main area when no ticket is selected. */
export function HomePage() {
  const viewer = useQuery(api.settings.viewer);
  return (
    <div className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-xl font-semibold">Pick a ticket from the inbox</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Estimate it, slice it, run the timer, and let calibration tune your next guess.
      </p>
      {viewer && !viewer.jiraConnected && (
        <p className="mt-4 text-sm">
          <Link to="/settings" className="text-primary underline-offset-4 hover:underline">
            Connect Jira in Settings
          </Link>{" "}
          to fill the inbox.
        </p>
      )}
    </div>
  );
}
