import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  ChangeOwnerPasswordBody,
  ChangeOwnerPasswordResponse,
  GetAuthSessionResponse,
  LoginOwnerBody,
  LoginOwnerResponse,
  LogoutOwnerResponse,
} from "@workspace/api-zod";
import {
  db,
  ownerAccountsTable,
  ownerSessionsTable,
} from "@workspace/db";
import {
  clearFailedLogins,
  clearOwnerSessionCookie,
  createOwnerSession,
  DEFAULT_OWNER_PASSWORD_HASH,
  ensureOwnerAccount,
  getOwnerSession,
  hashClientAddress,
  hashOwnerPassword,
  isLoginRateLimited,
  OwnerSetupError,
  recordFailedLogin,
  requireOwner,
  setOwnerSessionCookie,
  verifyOwnerPassword,
} from "../lib/owner-auth";

const router: IRouter = Router();

function sendSetupError(
  error: unknown,
  res: Response,
): boolean {
  if (!(error instanceof OwnerSetupError)) return false;
  res.status(503).json({ error: error.message });
  return true;
}

router.get("/auth/session", async (req, res, next): Promise<void> => {
  try {
    await ensureOwnerAccount();
    const session = await getOwnerSession(req);
    const data = GetAuthSessionResponse.parse(
      session
        ? {
            authenticated: true,
            username: session.owner.username,
            mustChangePassword: session.owner.mustChangePassword,
          }
        : {
            authenticated: false,
            username: null,
            mustChangePassword: false,
          },
    );
    res.json(data);
  } catch (error) {
    if (!sendSetupError(error, res)) next(error);
  }
});

router.post("/auth/login", async (req, res, next): Promise<void> => {
  const parsed = LoginOwnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a username and password." });
    return;
  }

  try {
    const addressHash = hashClientAddress(req.ip ?? "unknown");
    const owner = await ensureOwnerAccount();
    const validUsername = constantTimeStringEqual(
      parsed.data.username.trim(),
      owner.username,
    );
    let validPassword = await verifyOwnerPassword(
      parsed.data.password,
      owner.passwordHash,
    );

    // Existing local databases may contain the account created before the
    // private default credentials were configured. Allow that first-login
    // bootstrap to reconcile the stored account without replacing a password
    // the owner has already changed.
    if (
      !validPassword &&
      owner.mustChangePassword &&
      parsed.data.username === owner.username
    ) {
      validPassword = await verifyOwnerPassword(
        parsed.data.password,
        DEFAULT_OWNER_PASSWORD_HASH,
      );
      if (validPassword) {
        await db
          .update(ownerAccountsTable)
          .set({ passwordHash: DEFAULT_OWNER_PASSWORD_HASH, updatedAt: new Date() })
          .where(eq(ownerAccountsTable.id, owner.id));
      }
    }

    if (await isLoginRateLimited(addressHash) && !(validUsername && validPassword)) {
      res
        .status(429)
        .json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
      return;
    }

    if (!validUsername || !validPassword) {
      await recordFailedLogin(addressHash);
      res.status(401).json({ error: "Username or password is incorrect." });
      return;
    }

    await clearFailedLogins(addressHash);
    const token = await createOwnerSession(owner.id);
    setOwnerSessionCookie(res, token);
    res.json(
      LoginOwnerResponse.parse({
        username: owner.username,
        mustChangePassword: owner.mustChangePassword,
      }),
    );
  } catch (error) {
    if (!sendSetupError(error, res)) next(error);
  }
});

router.post("/auth/logout", requireOwner, async (req, res, next): Promise<void> => {
  try {
    if (req.ownerSessionTokenHash) {
      await db
        .delete(ownerSessionsTable)
        .where(eq(ownerSessionsTable.tokenHash, req.ownerSessionTokenHash));
    }
    clearOwnerSessionCookie(res);
    res.json(LogoutOwnerResponse.parse({ success: true }));
  } catch (error) {
    next(error);
  }
});

router.post(
  "/auth/password",
  requireOwner,
  async (req, res, next): Promise<void> => {
    const parsed = ChangeOwnerPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "The new password must be at least 12 characters.",
      });
      return;
    }
    const owner = req.ownerAccount;
    if (!owner) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    try {
      const currentPasswordIsValid = await verifyOwnerPassword(
        parsed.data.currentPassword,
        owner.passwordHash,
      );
      if (!currentPasswordIsValid) {
        res.status(400).json({ error: "Current password is incorrect." });
        return;
      }
      if (
        await verifyOwnerPassword(parsed.data.newPassword, owner.passwordHash)
      ) {
        res.status(400).json({
          error: "Choose a new password that differs from the current one.",
        });
        return;
      }

      const passwordHash = await hashOwnerPassword(parsed.data.newPassword);
      await db
        .update(ownerAccountsTable)
        .set({
          passwordHash,
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(ownerAccountsTable.id, owner.id));
      await db
        .delete(ownerSessionsTable)
        .where(eq(ownerSessionsTable.ownerId, owner.id));
      clearOwnerSessionCookie(res);
      res.json(ChangeOwnerPasswordResponse.parse({ success: true }));
    } catch (error) {
      next(error);
    }
  },
);

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export default router;
