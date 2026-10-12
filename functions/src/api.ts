/**
 * Wire contract for the callable functions. The Android client mirrors these
 * shapes, so a change here is a change there too.
 */

/** One meal of the plan being turned into a grocery list. */
export interface GroceryListMeal {
  name: string;
  recipeText: string;
}

/** Request payload for the `generateGroceryList` callable. */
export interface GenerateGroceryListRequest {
  meals: GroceryListMeal[];
}

/**
 * One piece of the grocery list, streamed as it is produced. Concatenating
 * every chunk's `text` in order rebuilds the finished list exactly.
 */
export interface GroceryListChunk {
  text: string;
}

/**
 * The finished list. Returned when the stream ends, and as the whole response
 * to clients that did not ask for a stream.
 */
export interface GenerateGroceryListResponse {
  groceryList: string;
}
