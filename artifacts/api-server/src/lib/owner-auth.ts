import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { and, eq, gt, lte } from "drizzle-orm";
import {
  db,
  ownerAccountsTable,
  ownerLoginAttemptsTable,
  ownerSessionsTable,
  pool,
  type OwnerAccount,
} from "@workspace/db";

const COOKIE_NAME = "agentmilton.sid";
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_ATTEMPT_LIMIT = 5;
const OWNER_ID = 1;
const OWNER_USERNAME = process.env.OWNER_USERNAME ?? "Trocate9";
const DEFAULT_OWNER_PASSWORD_HASH =
  "scrypt$096e066b39a5439ab198fd39e74f579f$9716cc49a46dc15e5e2683926e7a1e6ed8fcda6d6d449bdf29d6819e99749a5674cfc14bb766b772c896b24a86984c410e91a7c207cb32d5325a61b08bfba1b4";

declare global {
  namespace Express {
    interface Request {
      ownerAccount?: OwnerAccount;
      ownerSessionTokenHash?: string;
    }
  }
}

export class OwnerSetupError extends Error {}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new OwnerSetupError("Owner authentication is not configured.");
  }
  return secret;
}

function derivePasswordHash(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashOwnerPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derivePasswordHash(password, salt);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyOwnerPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, saltHex, expectedHex] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !saltHex ||
    !expectedHex ||
    !/^[\da-f]{32}$/i.test(saltHex) ||
    !/^[\da-f]{128}$/i.test(expectedHex)
  ) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = await derivePasswordHash(password, Buffer.from(saltHex, "hex"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function constantTimeStringEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  if (left.length !== right.length) {
    const comparisonBuffer = Buffer.alloc(left.length);
    timingSafeEqual(left, comparisonBuffer);
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function ensureOwnerAccount(): Promise<OwnerAccount> {
  const [existing] = await db
    .select()
    .from(ownerAccountsTable)
    .where(eq(ownerAccountsTable.id, OWNER_ID))
    .limit(1);
  if (existing) return existing;

  const passwordHash = process.env.OWNER_BOOTSTRAP_PASSWORD
    ? await hashOwnerPassword(process.env.OWNER_BOOTSTRAP_PASSWORD)
    : DEFAULT_OWNER_PASSWORD_HASH;
  const [created] = await db
    .insert(ownerAccountsTable)
    .values({
      id: OWNER_ID,
      username: OWNER_USERNAME,
      passwordHash,
      mustChangePassword: true,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [afterConcurrentSetup] = await db
    .select()
    .from(ownerAccountsTable)
    .where(eq(ownerAccountsTable.id, OWNER_ID))
    .limit(1);
  if (!afterConcurrentSetup) {
    throw new OwnerSetupError("Owner account setup could not be completed.");
  }
  return afterConcurrentSetup;
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashClientAddress(address: string): string {
  return createHmac("sha256", getSessionSecret()).update(address).digest("hex");
}

export async function isLoginRateLimited(addressHash: string): Promise<boolean> {
  const [attempts] = await db
    .select()
    .from(ownerLoginAttemptsTable)
    .where(eq(ownerLoginAttemptsTable.addressHash, addressHash))
    .limit(1);
  if (!attempts) return false;

  const now = Date.now();
  const withinWindow =
    now - attempts.windowStartedAt.getTime() < LOGIN_WINDOW_MS;
  return (
    (attempts.blockedUntil !== null && attempts.blockedUntil.getTime() > now) ||
    (withinWindow && attempts.attemptCount >= LOGIN_ATTEMPT_LIMIT)
  );
}

export async function recordFailedLogin(addressHash: string): Promise<void> {
  await pool.query(
    `INSERT INTO owner_login_attempts
       (address_hash, window_started_at, attempt_count, blocked_until)
     VALUES ($1, NOW(), 1, NULL)
     ON CONFLICT (address_hash) DO UPDATE SET
       window_started_at = CASE
         WHEN owner_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes'
           THEN NOW()
         ELSE owner_login_attempts.window_started_at
       END,
       attempt_count = CASE
         WHEN owner_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes'
           THEN 1
         ELSE owner_login_attempts.attempt_count + 1
       END,
       blocked_until = CASE
         WHEN owner_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes'
           THEN NULL
         WHEN owner_login_attempts.attempt_count + 1 >= $2
           THEN NOW() + INTERVAL '15 minutes'
         ELSE owner_login_attempts.blocked_until
       END`,
    [addressHash, LOGIN_ATTEMPT_LIMIT],
  );
}

export async function clearFailedLogins(addressHash: string): Promise<void> {
  await db
    .delete(ownerLoginAttemptsTable)
    .where(eq(ownerLoginAttemptsTable.addressHash, addressHash));
}

export async function createOwnerSession(ownerId: number): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  const token = randomBytes(32).toString("base64url");
  await db
    .delete(ownerSessionsTable)
    .where(lte(ownerSessionsTable.expiresAt, now));
  await db.insert(ownerSessionsTable).values({
    tokenHash: hashSessionToken(token),
    ownerId,
    expiresAt,
  });
  return token;
}

export function setOwnerSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
    maxAge: SESSION_LIFETIME_MS,
  });
}

export function clearOwnerSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
  });
}

export async function getOwnerSession(
  req: Request,
): Promise<{ owner: OwnerAccount; tokenHash: string } | null> {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token !== "string" || !/^[\w-]{43}$/.test(token)) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const [result] = await db
    .select({ owner: ownerAccountsTable })
    .from(ownerSessionsTable)
    .innerJoin(
      ownerAccountsTable,
      eq(ownerSessionsTable.ownerId, ownerAccountsTable.id),
    )
    .where(
      and(
        eq(ownerSessionsTable.tokenHash, tokenHash),
        gt(ownerSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return result ? { owner: result.owner, tokenHash } : null;
}

export const requireOwner: RequestHandler = async (
  req,
  res,
  next,
): Promise<void> => {
  try {
    const session = await getOwnerSession(req);
    if (!session) {
      clearOwnerSessionCookie(res);
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    req.ownerAccount = session.owner;
    req.ownerSessionTokenHash = session.tokenHash;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireChangedPassword: RequestHandler = (
  req,
  res,
  next,
): void => {
  if (!req.ownerAccount) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (req.ownerAccount.mustChangePassword) {
    res.status(403).json({ error: "Change the initial password to continue." });
    return;
  }
  next();
};
