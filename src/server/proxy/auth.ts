import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { subKey } from "@/server/db/schema/subKey";
import { weeekWorkspace } from "@/server/db/schema/workspace";
import { decrypt } from "@/server/crypto/aesGcm";
import { hashSubKey, RAW_KEY_PREFIX } from "@/server/crypto/subKey";
import type { AuthedRequest, ProxyErrorCode } from "./types";

export type AuthOk = { kind: "ok"; authed: AuthedRequest };
export type AuthErr = {
  kind: "err";
  code: Extract<ProxyErrorCode, "unauthenticated">;
  message: string;
};
export type AuthResult = AuthOk | AuthErr;

const UNAUTH = (msg: string): AuthErr => ({ kind: "err", code: "unauthenticated", message: msg });

function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value;
}

export async function authenticateBearer(req: Request): Promise<AuthResult> {
  const raw = extractBearer(req);
  if (!raw) return UNAUTH("Missing or invalid Authorization header");
  if (!raw.startsWith(RAW_KEY_PREFIX)) return UNAUTH("Bearer does not match expected prefix");

  const hash = hashSubKey(raw);

  const [row] = await db
    .select({
      sk: subKey,
      ws: {
        id: weeekWorkspace.id,
        ciphertext: weeekWorkspace.masterKeyCiphertext,
        iv: weeekWorkspace.masterKeyIv,
        tag: weeekWorkspace.masterKeyTag,
        encVersion: weeekWorkspace.encVersion,
      },
    })
    .from(subKey)
    .innerJoin(weeekWorkspace, eq(weeekWorkspace.id, subKey.workspaceId))
    .where(and(eq(subKey.hash, hash), eq(subKey.status, "active")))
    .limit(1);

  if (!row) return UNAUTH("Sub-key not found or revoked");

  let masterKey: string;
  try {
    masterKey = await decrypt({
      ciphertext: row.ws.ciphertext,
      iv: row.ws.iv,
      tag: row.ws.tag,
      encVersion: row.ws.encVersion,
    });
  } catch {
    return UNAUTH("Master key envelope failed to decrypt");
  }

  return {
    kind: "ok",
    authed: {
      subKeyId: row.sk.id,
      subKeyShortId: row.sk.id.slice(0, 8),
      workspaceId: row.ws.id,
      verbs: row.sk.verbs,
      scopeProjects: row.sk.scopeProjects,
      scopeBoards: row.sk.scopeBoards,
      boundWeeekUserId: row.sk.boundWeeekUserId,
      visibilityBound: row.sk.visibilityBound,
      authorRewrite: row.sk.authorRewrite,
      masterKey,
    },
  };
}
