import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { encryptTokens } from "./jira";
import { accessibleSites, exchangeCode } from "./lib/jira";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Atlassian redirects here after consent; we always send the browser back to Settings. */
http.route({
  path: "/jira/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const params = new URL(req.url).searchParams;
    const back = (result: string) =>
      new Response(null, {
        status: 302,
        headers: { Location: `${process.env.SITE_URL ?? ""}/settings?jira=${result}`, "Cache-Control": "no-store" },
      });

    const state = params.get("state");
    const userId = state ? await ctx.runMutation(internal.jira.consumeState, { state }) : null;
    if (userId === null) return back("expired");
    if (params.get("error")) return back("denied");
    const code = params.get("code");
    if (!code || !(await ctx.runQuery(internal.settings.isAllowed, { userId }))) return back("error");

    try {
      const tokens = await exchangeCode(code);
      const sites = await accessibleSites(tokens.accessToken);
      if (sites.length === 0) return back("nosite");
      await ctx.runMutation(internal.jira.storeConnection, { userId, ...(await encryptTokens(tokens)), sites });
      return back(sites.length === 1 ? "connected" : "pick");
    } catch (err) {
      console.error("Jira OAuth callback failed", err instanceof Error ? err.message : err);
      return back("error");
    }
  }),
});

export default http;
