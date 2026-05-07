import { router } from "../init";
import { meRouter } from "./me";
import { workspaceRouter } from "./workspace";
import { subKeyRouter } from "./subKey";
import { weeekDirectoryRouter } from "./weeekDirectory";
import { auditRouter } from "./audit";

export const appRouter = router({
  me: meRouter,
  workspace: workspaceRouter,
  subKey: subKeyRouter,
  weeekDirectory: weeekDirectoryRouter,
  audit: auditRouter,
});
export type AppRouter = typeof appRouter;
