import { router } from "../init";
import { meRouter } from "./me";
import { workspaceRouter } from "./workspace";
import { subKeyRouter } from "./subKey";
import { weeekDirectoryRouter } from "./weeekDirectory";
import { auditRouter } from "./audit";
import { orgRouter } from "./org";

export const appRouter = router({
  me: meRouter,
  workspace: workspaceRouter,
  subKey: subKeyRouter,
  weeekDirectory: weeekDirectoryRouter,
  audit: auditRouter,
  org: orgRouter,
});
export type AppRouter = typeof appRouter;
