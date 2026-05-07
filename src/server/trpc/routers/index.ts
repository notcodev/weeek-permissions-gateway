import { router } from "../init";
import { meRouter } from "./me";
import { workspaceRouter } from "./workspace";
import { subKeyRouter } from "./subKey";

export const appRouter = router({
  me: meRouter,
  workspace: workspaceRouter,
  subKey: subKeyRouter,
});
export type AppRouter = typeof appRouter;
