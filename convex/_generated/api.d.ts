/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as brands from "../brands.js";
import type * as chainPlans from "../chainPlans.js";
import type * as chains from "../chains.js";
import type * as home from "../home.js";
import type * as kpi from "../kpi.js";
import type * as migrations from "../migrations.js";
import type * as model from "../model.js";
import type * as people from "../people.js";
import type * as promotions from "../promotions.js";
import type * as raci from "../raci.js";
import type * as seasons from "../seasons.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as taskTemplates from "../taskTemplates.js";
import type * as tasks from "../tasks.js";
import type * as templateDefaults from "../templateDefaults.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  brands: typeof brands;
  chainPlans: typeof chainPlans;
  chains: typeof chains;
  home: typeof home;
  kpi: typeof kpi;
  migrations: typeof migrations;
  model: typeof model;
  people: typeof people;
  promotions: typeof promotions;
  raci: typeof raci;
  seasons: typeof seasons;
  seed: typeof seed;
  seedData: typeof seedData;
  taskTemplates: typeof taskTemplates;
  tasks: typeof tasks;
  templateDefaults: typeof templateDefaults;
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
