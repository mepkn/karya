import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

/** requireUserId for actions, which have no ctx.db: the allowlist check runs in a query. */
export async function requireActionUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null || !(await ctx.runQuery(internal.settings.isAllowed, { userId }))) {
    throw new ConvexError("Not signed in.");
  }
  return userId;
}
