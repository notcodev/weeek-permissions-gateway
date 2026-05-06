import { protectedProcedure, router } from "../init";

export const meRouter = router({
  whoami: protectedProcedure.query(({ ctx }) => ({
    id: ctx.session.user.id,
    email: ctx.session.user.email,
    name: ctx.session.user.name,
  })),
});
