import { authedQuery } from "./access";
import { ALL_PHASES, raciDefaults } from "./model";

// The slide-16 matrix on its own, for the assignment flow. A tier view asks for
// the defaults of the phases it owns; the RACI editor on a task row needs every
// phase, because a picker has to know which functions are expected to act before
// it can put them at the top of the list.

/**
 * Function-level defaults for all nine phases. These are guidance: a task counts
 * as assigned only when a *named* person is Responsible (CONTEXT.md: Unassigned).
 */
export const matrix = authedQuery({
  args: {},
  handler: async (ctx) => await raciDefaults(ctx, ALL_PHASES),
});
