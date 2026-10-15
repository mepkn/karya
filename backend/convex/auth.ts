import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";
import { isAllowedEmail } from "./lib/allowlist";
import { ensureUserDefaults } from "./lib/defaults";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Runs for sign-up and sign-in alike, before anything is stored. Rejecting
      // non-allowlisted emails here means nobody outside ALLOWED_EMAILS can sign up.
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new ConvexError("Enter a valid email address.");
        }
        if (!isAllowedEmail(email)) {
          throw new ConvexError("This email is not on the allowlist.");
        }
        return { email };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new ConvexError("Password must be at least 8 characters.");
        }
      },
    }),
  ],
  callbacks: {
    // Seeds settings and pain-point weights the first time a user signs in.
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      await ensureUserDefaults(ctx, userId);
    },
  },
});
