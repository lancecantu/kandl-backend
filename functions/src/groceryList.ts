import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import Anthropic from "@anthropic-ai/sdk";
import type {
  GenerateGroceryListRequest,
  GenerateGroceryListResponse,
  GroceryListChunk,
  GroceryListMeal,
} from "./api";

/**
 * Read at run time from Secret Manager, so the key is never in source or in
 * deployed config. It has to be declared on the function below too; without
 * that the value is empty when the handler runs.
 */
const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

const MODEL = "claude-opus-5-5";

/**
 * The finished list is a few dozen short lines, so this is headroom rather
 * than a target. Streaming means there is no request timeout to stay under.
 */
const MAX_TOKENS = 4096;

/**
 * Thinking is always on for this model. Low effort keeps it short so the
 * first chunk reaches the client quickly instead of after a long pause.
 */
const EFFORT = "low";

/**
 * The store path in `SYSTEM_PROMPT` is the real one: it is the order the
 * aisles come in, not a categorization. Reordering it changes the list.
 */
const SYSTEM_PROMPT = `You build one grocery list out of a set of dinner
recipes. The list is for one household of two and is only ever read by them,
so write it the way they write it by hand rather than the way a general
shopping app would.

Output the list and nothing else: no preamble, no headings, no totals, no
closing remarks. One item per line, first word capitalized.

QUANTITIES
- Put the count after the name only when it is 2 or more: "Avocados 2". A
  single item is written bare: "Broccoli".
- An ingredient that is present in several recipes should be output as one line,
  with total required count added together, however oftentimes a single count of
  an ingredient can suffice for multiple recipes. In that case it should be
  output singularly, only add a "2" when a single item doesn't suffice the
  total need. (e.g. 3 separate recipes call for 5 ribs of celery in total, you
  output "Celery" as 1 head is enough)
- Never carry a measurement over from a recipe. 15 oz of crushed tomatoes is
  just "Crushed tomatoes". One line is one thing off the shelf: one can, one
  bunch, one head, one bag.
- A recipe calling for one of something, or for a small amount of it, is 1.
  Do not convert units or total partial amounts up: "Broccoli" is a head,
  "Sweet potato" is a spud, "Corn" is a can.
- Never add an ingredient no recipe asked for. Water, sugar, and cooking oil of
  any kind (olive, vegetable, sesame) should never be output to the list since
  they are household staples even if they are asked for.

STANDING RULES
- Chicken: a recipe calling for chicken breast, or for chicken without
  saying which cut, uses half of the 1.5 lb pack no matter what amount it
  states. Two such recipes are one "Chicken"; round up, so three recipes are
  "Chicken 2". Chicken thighs are a separate item and this rule does not
  reach them.
- Ground turkey: the same half-a-package rule, listed as "Turkey".
- Onion: an unspecified onion is yellow, listed as "Onions". A recipe naming
  another kind gets its own line, e.g. "Red onion".
- Broth: one 4-cup box covers a soup, a single non-soup meal requiring 2-3
  cups, or 0.5-2 cups across one or more non-soup meals. Output "Chicken broth"
  for a box, "Chicken broth can" for a can, and use a can only when a recipe
  asks for one. Err toward an extra box rather than running short.
- Taco seasoning comes in packets, so it is an ordinary item on its own
  line, not a seasoning.
- Carrots are always bought in bags containing 10 medium carrots. So just write
  "Carrots" for that line item as long as the total is under that number.
- Baby spinach and iceberg lettuce are always bought in large containers that
  suffice for 6-7 meals containing them. Once beyond that, add multiples.
- Garlic is always bought by the bulb. One bulb yields at least 8 cloves.
- Drop additional descriptors like "whole grain" or "reduced fat" before output.
- Plurals (adding "s" to a word) can be inconsistent, generally use them for
  multiple of something but it's not required.

SEASONINGS
Spices, dried herbs, salt and pepper never get their own lines. Gather every
one the recipes call for into a single line at the very end of the list:
"Check: cumin, smoked paprika, oregano, salt, and pepper". Nothing comes after
that line.

ORDER
The list is walked, not read. Its order is the path through the store, so
order every item the way the reference below does:

Avocados
Zucchini
Red bell peppers
Asparagus
Tomatoes
Cherry tomatoes
Broccoli
Fresh basil
Lettuce
Spinach
Celery
Jalapeno pepper
Poblano pepper
Onions
Red onion
Garlic bulb
Cilantro
Coleslaw
Sweet potato
Carrot
Cheddar cheese
Feta cheese
Mozzarella
Basil pesto
Burger buns
Baguette
Parmesan cheese
Chicken
Chicken thighs
Turkey
Butter
Teriyaki sauce
White rice
Brown rice
Basmati rice
Soy sauce
Coconut milk
Chickpeas
Enchilada sauce
Salsa
Tortillas
Taco seasoning
Veggie patties
Corn
Cream corn
Peas
Black beans
Red kidney beans
Cannellini beans
Green lentils
Flour
Brown sugar
Crushed tomatoes
Tomato sauce
Whole peeled tomatoes
Tomato paste
Diced tomatoes and green chiles
Ditalini noodles
Rigatoni noodles
Elbow noodles
Shell noodles
Farfalle noodles
Penne noodles
Barbecue sauce
Hot sauce
Ketchup
Chicken broth
Beef broth
Vegetable broth
Chicken broth can
Beef broth can
Vegetable broth can
Raviolis
Tortellini
Half and half
Whole milk
Eggs

An item the reference does not name goes beside the items it most resembles.
If it fits within the category of foods (veggie around other veggies) nothing
else is needed but if it doesn't you should add "* (order unknown)" after it:
"Halloumi* (order unknown)". Never do that to a seasoning.

EXAMPLE

In the example below I will list the 5 meals that we put into the meal plan,
the recipes for each of those meals, and then the output grocery list. This
should attempt to exemplify the rules above to show how they are applied to
the creation of lists.

Meals & Recipes:

Creamy Rigatoni Pasta
1 onion
Fresh basil (bunch)
1 container cherry tomatoes
1/3 cup half and half
8oz ball of mozzarella
2 cups penne pasta
Baby spinach
1 28oz can whole tomatoes
3 cloves of garlic
Oregano, basil, thyme, garlic powder, red pepper flakes, 
salt and pepper to taste

White Bean Soup
4 cups chicken broth
1 can cannellini beans
1.5 carrots
2 ribs of celery
1/2 onion
1/4 cup parmesan cheese
1 cup whole grain elbow pasta
Baby spinach

American
Chicken
1 Sweet potato
A vegetable side (for American)

Coconut Chickpea Curry
3/4 onion
1.5 cloves garlic
1 28oz can crushed tomatoes
2 cans chickpeas
3 cups vegetable broth
1/2 can reduce fat coconut milk
Baby Spinach
Basmati Rice
2 tsp curry powder
1 tsp coriander
1 tsp cumin
1 tsp turmeric
1/4 tsp red pepper flakes
1 tsp salt
1 tsp garam masala
2 tsp sugar
1/2 tsp ground ginger
Black pepper to taste

Chicken Enchiladas
Chicken
Enchilada sauce
Block of cheddar cheese
1 Tomato
Iceberg Lettuce
Chili powder, cumin, garlic powder, cayenne powder, salt and pepper to taste

Output:
Tomato
Cherry tomatoes
Fresh basil
Lettuce
Baby spinach
Celery
Onions 3
Garlic bulb
Vegetable side for American* (recipe doesn't say which; pick one)
Sweet potato
Carrots
Cheddar cheese
Mozzarella
Parmesan cheese
Chicken
Basmati rice
Coconut milk
Chickpeas 2
Enchilada sauce
Cannellini beans
Crushed tomatoes
Whole peeled tomatoes
Elbow noodles
Penne noodles
Chicken broth
Vegetable broth
Half and half
Check: oregano, basil, thyme, garlic powder, red pepper flakes,
curry powder, coriander, cumin, turmeric, garam masala, ground ginger,
chili powder, cayenne, salt, and pepper

NOTES
Add a note ("* (<note text>)") only when you truly cannot resolve something.
A reasonable guess needs none: they read the list closely and will catch it, so
deleting a note costs them more than the guess would.

The one exception: when a recipe names a category rather than an item, keep the
category and add a note that the choice is open.`;

const isMeal = (value: unknown): value is GroceryListMeal => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const meal = value as Partial<GroceryListMeal>;
  return typeof meal.name === "string" &&
    typeof meal.recipeText === "string";
};

const parseMeals = (data: unknown): GroceryListMeal[] => {
  const meals = (data as Partial<GenerateGroceryListRequest> | undefined)
    ?.meals;
  if (!Array.isArray(meals) || meals.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "Send a non-empty `meals` array.",
    );
  }
  if (!meals.every(isMeal)) {
    throw new HttpsError(
      "invalid-argument",
      "Every meal needs a string `name` and `recipeText`.",
    );
  }
  return meals;
};

// One headed block per meal, so the model can tell the recipes apart.
const formatMeals = (meals: GroceryListMeal[]): string =>
  meals.map((meal) => `## ${meal.name}\n${meal.recipeText}`).join("\n\n");

/**
 * Turns a plan's recipes into a grocery list, streaming it as it is built.
 * Callers that did not ask for a stream get the whole list in the response.
 */
export const generateGroceryList = onCall<
  GenerateGroceryListRequest,
  Promise<GenerateGroceryListResponse>,
  GroceryListChunk
>({
  secrets: [anthropicKey],
  // Overrides the global cap of 1, which would queue callers behind each
  // other for the whole length of a generation.
  maxInstances: 10,
  // A generation runs far longer than the placeholder did; the 60s default
  // would cut off a slow one mid-stream.
  timeoutSeconds: 120,
}, async (request, response) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in to generate a grocery list.",
    );
  }

  const meals = parseMeals(request.data);

  logger.info("Generating grocery list", {
    uid: request.auth.uid,
    mealCount: meals.length,
    streaming: request.acceptsStreaming,
  });

  // Built per call: secret values do not exist when the module is loaded.
  const client = new Anthropic({apiKey: anthropicKey.value()});

  // Accumulated as it streams, so non-streaming callers get the same text.
  let groceryList = "";

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: {effort: EFFORT},
      system: SYSTEM_PROMPT,
      messages: [{role: "user", content: formatMeals(meals)}],
    });

    // Thinking blocks stream too, and are empty. Only text is the list.
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        groceryList += event.delta.text;
        await response?.sendChunk({text: event.delta.text});
      }
    }

    const final = await stream.finalMessage();

    if (final.stop_reason === "refusal") {
      logger.error("Generation refused", {
        category: final.stop_details?.category,
      });
      throw new HttpsError(
        "internal",
        "Could not generate a list for these recipes.",
      );
    }

    if (final.stop_reason === "max_tokens") {
      logger.warn("Grocery list hit the output cap and may be cut short", {
        uid: request.auth.uid,
      });
    }

    logger.info("Grocery list generated", {
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof Anthropic.RateLimitError) {
      logger.error("Anthropic rate limited", {message: error.message});
      throw new HttpsError(
        "resource-exhausted",
        "Too busy right now. Try again in a moment.",
      );
    }
    if (error instanceof Anthropic.APIError) {
      logger.error("Anthropic API error", {
        status: error.status,
        message: error.message,
      });
      throw new HttpsError("internal", "Could not generate a grocery list.");
    }
    throw error;
  }

  return {groceryList};
});
