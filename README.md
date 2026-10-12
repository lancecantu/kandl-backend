# kandl-backend
Node backend for Kandl grocery app

## Access control

The Android client's Firebase config is public, so anyone can create an
account in this project. Sign-in therefore grants nothing on its own: access
is gated on a `kandlAccess` custom claim, which both `firestore.rules` and
the callable functions check.

Grant or revoke it per account:

```sh
cd functions
npm run grant-access -- someone@example.com
npm run grant-access -- someone@example.com --revoke
```

The script needs Application Default Credentials
(`gcloud auth application-default login`). It revokes the account's refresh
tokens, so each device has to sign in again before the change takes effect.

Firestore rules additionally scope every document to its owner via the
`userId` field, so an allow-listed account still only ever sees its own
recipes and meal plans.
