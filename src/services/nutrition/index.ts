import { NutritionixProvider } from './nutritionix';
import { OpenFoodFactsProvider } from './openFoodFacts';
import { NutritionProvider } from './types';

export type { FoodItem, NutritionProvider } from './types';

export function createNutritionService(prefer: 'nutritionix' | 'off' = 'nutritionix'): NutritionProvider {
  if (prefer === 'off') return new OpenFoodFactsProvider();
  return new NutritionixProvider();
}

