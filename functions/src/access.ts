import {HttpsError} from "firebase-functions/v2/https";
import type {CallableRequest} from "firebase-functions/v2/https";

/**
 * Custom claim marking an account as allowed to use Kandl.
 *
 * The Firebase client config ships inside the APK and the Android repo is
 * public, so anyone can create an account in this project. Being signed in
 * therefore proves nothing on its own; this claim is what actually grants
 * access, and it is only ever set out of band by `npm run grant-access`.
 * Firestore rules gate on the same claim.
 */
export const ACCESS_CLAIM = "kandlAccess";

/**
 * Returns the caller's uid, rejecting anyone not signed in and allow-listed.
 *
 * Callables run with Admin credentials and never pass through Firestore
 * rules, so each one has to make this check itself.
 *
 * @param {CallableRequest} request The incoming callable request.
 * @return {string} The allow-listed caller's uid.
 */
export function requireAllowedUser(request: CallableRequest<unknown>): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to use Kandl.");
  }
  if (request.auth.token[ACCESS_CLAIM] !== true) {
    throw new HttpsError(
      "permission-denied",
      "This account is not allowed to use Kandl.",
    );
  }
  return request.auth.uid;
}
