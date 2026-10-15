import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useAction, useMutation } from "convex/react";
import { ExternalLink, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";

type Site = { id: string; name: string; url: string };
type Props = {
  connected: boolean;
  siteName: string | null;
  siteUrl: string | null;
  pendingSites: Site[] | null;
  lastSyncedAt: number | null;
};

const CALLBACK_MESSAGES: Record<string, [ok: boolean, text: string]> = {
  connected: [true, "Jira connected"],
  pick: [true, "Jira connected. Pick the site to sync from."],
  denied: [false, "Jira access was not granted."],
  expired: [false, "That Jira sign-in expired. Try connecting again."],
  nosite: [false, "This Atlassian account has no Jira site Karya can read."],
  error: [false, "Could not connect Jira. Try again."],
};

/** Read-only Jira connect (OAuth 3LO), site picker and disconnect. */
export function JiraSection({ connected, siteName, siteUrl, pendingSites, lastSyncedAt }: Props) {
  const startConnect = useAction(api.jira.startConnect);
  const chooseSite = useMutation(api.jira.chooseSite);
  const disconnect = useMutation(api.jira.disconnect);
  const sync = useAction(api.jira.syncMyTickets);
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);

  // Result of the OAuth round trip, passed back by /jira/callback.
  useEffect(() => {
    const result = params.get("jira");
    if (!result) return;
    const [ok, text] = CALLBACK_MESSAGES[result] ?? CALLBACK_MESSAGES.error;
    if (ok) toast.success(text);
    else toast.error(text);
    setParams({}, { replace: true });
  }, [params, setParams]);

  async function connect() {
    setBusy(true);
    try {
      window.location.assign(await startConnect());
    } catch (err) {
      toast.error(errorMessage(err, "Jira connect is not set up on the server."));
      setBusy(false);
    }
  }

  async function pick(site: Site) {
    setBusy(true);
    try {
      await chooseSite({ siteId: site.id });
      const r = await sync({});
      toast.success(r.skipped ? `Using ${site.name}` : `Using ${site.name}: ${r.added} tickets synced`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (pendingSites && pendingSites.length > 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Your Atlassian account has several Jira sites. Which one holds your tickets?</p>
        <div className="flex flex-col gap-2">
          {pendingSites.map((s) => (
            <Button key={s.id} variant="outline" className="justify-start" disabled={busy} onClick={() => void pick(s)}>
              {s.name} <span className="text-muted-foreground">{s.url.replace(/^https:\/\//, "")}</span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Karya reads the open tickets assigned to you. It never changes anything in Jira.
        </p>
        <Button onClick={() => void connect()} disabled={busy}>
          {busy ? <Spinner /> : <Link2 />} Connect Jira
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Connected to{" "}
        {siteUrl ? (
          <a href={siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
            {siteName} <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="font-medium">{siteName}</span>
        )}
        <span className="text-muted-foreground"> (read-only)</span>
      </p>
      <p className="text-sm text-muted-foreground">
        {lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}.` : "Not synced yet."}
      </p>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" />}>
          <Unlink /> Disconnect
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Jira?</AlertDialogTitle>
            <AlertDialogDescription>
              Karya deletes its Jira tokens. Tickets already synced, and their estimates and slices, stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void disconnect().then(
                  () => toast.success("Jira disconnected"),
                  (err: unknown) => toast.error(errorMessage(err)),
                )
              }
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
