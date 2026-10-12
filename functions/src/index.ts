/**
 * Function entry point. Each trigger lives in its own module and is
 * re-exported here, which is how Firebase discovers it.
 *
 * See a full list of supported triggers at
 * https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {initializeApp} from "firebase-admin/app";

// Initialized up front so any trigger added later can reach Firestore and the
// other Admin SDK surfaces without repeating this.
initializeApp();

// For cost control, cap how many containers run at once. This mitigates the
// impact of a traffic spike by degrading latency instead of spend. Set before
// the exports below, so the triggers pick it up as they are defined; a
// function that needs more sets `maxInstances` in its own options.
setGlobalOptions({maxInstances: 1});

export {generateGroceryList} from "./groceryList";
