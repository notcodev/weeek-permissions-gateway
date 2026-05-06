import { router } from "../init";
import { meRouter } from "./me";
import { workspaceRouter } from "./workspace";

export const appRouter = router({
  me: meRouter,
  workspace: workspaceRouter,
});
export type AppRouter = typeof appRouter;
