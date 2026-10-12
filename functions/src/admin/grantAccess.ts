/**
 * One-off admin script that grants or revokes Kandl access for one account.
 *
 * From `functions/`:
 *   npm run grant-access -- someone@example.com
 *   npm run grant-access -- someone@example.com --revoke
 *
 * It runs against whatever project your Application Default Credentials
 * point at, so run `gcloud auth application-default login` first. Nothing
 * imports this module, so it is never loaded by the deployed functions.
 */

import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {ACCESS_CLAIM} from "../access";

/**
 * Sets or clears {@link ACCESS_CLAIM} on the account with the given email.
 *
 * @return {Promise<void>} Resolves once the claim has been written.
 */
async function main(): Promise<void> {
  const [email, ...flags] = process.argv.slice(2);
  if (!email) {
    throw new Error("Usage: npm run grant-access -- <email> [--revoke]");
  }
  const revoking = flags.includes("--revoke");

  initializeApp();
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);

  // Spread so this only ever touches our own claim, leaving any other alone.
  await auth.setCustomUserClaims(user.uid, {
    ...user.customClaims,
    [ACCESS_CLAIM]: revoking ? null : true,
  });

  // Already-issued ID tokens carry the old claims until they expire, which
  // can take an hour. Revoking refresh tokens forces a fresh one instead.
  await auth.revokeRefreshTokens(user.uid);

  const verb = revoking ? "Revoked" : "Granted";
  console.log(`${verb} Kandl access for ${email} (${user.uid}).`);
  console.log("Sign out and back in on each device to pick up the change.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
