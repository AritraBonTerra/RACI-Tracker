import { query } from "./_generated/server";

// Health-check query for the walking skeleton: the frontend renders this to
// prove it is talking to the deployed Convex backend.
export const status = query({
  args: {},
  handler: async () => ({
    message: "Hello from Convex — the pipeline is live.",
    serverTime: Date.now(),
  }),
});
