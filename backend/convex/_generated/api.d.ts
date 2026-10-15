/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as geminiKey from "../geminiKey.js";
import type * as http from "../http.js";
import type * as jira from "../jira.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_actionAuth from "../lib/actionAuth.js";
import type * as lib_allowlist from "../lib/allowlist.js";
import type * as lib_defaults from "../lib/defaults.js";
import type * as lib_demoTickets from "../lib/demoTickets.js";
import type * as lib_gemini from "../lib/gemini.js";
import type * as lib_jira from "../lib/jira.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as settings from "../settings.js";
import type * as tickets from "../tickets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  geminiKey: typeof geminiKey;
  http: typeof http;
  jira: typeof jira;
  "lib/access": typeof lib_access;
  "lib/actionAuth": typeof lib_actionAuth;
  "lib/allowlist": typeof lib_allowlist;
  "lib/defaults": typeof lib_defaults;
  "lib/demoTickets": typeof lib_demoTickets;
  "lib/gemini": typeof lib_gemini;
  "lib/jira": typeof lib_jira;
  "lib/secrets": typeof lib_secrets;
  settings: typeof settings;
  tickets: typeof tickets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
