import { router } from "../init";
import { meRouter } from "./me";
import { workspaceRouter } from "./workspace";
import { subKeyRouter } from "./subKey";
import { weeekDirectoryRouter } from "./weeekDirectory";

export const appRouter = router({
  me: meRouter,
  workspace: workspaceRouter,
  subKey: subKeyRouter,
  weeekDirectory: weeekDirectoryRouter,
});
export type AppRouter = typeof appRouter;
