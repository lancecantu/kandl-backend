import {FieldValue, Timestamp} from "firebase-admin/firestore";

export type RecipeBase = {
    name: string;
    recipeText: string;
    status: "default" | "favorited" | "archived";
    usedCount: number;
    recipeUrl?: string;
}

export type RecipeWrite = RecipeBase & {
    createdAt: FieldValue;
}

export type Recipe = RecipeBase & {
    id: string;
    createdAt: Timestamp;
}

export type MealPlanBase = {
    name: string;
    meals: Recipe[];
    ingredientText: string;
}

export type MealPlanWrite = MealPlanBase & {
    createdAt: FieldValue;
}

export type MealPlan = MealPlanBase & {
    id: string;
    createdAt: Timestamp;
}
