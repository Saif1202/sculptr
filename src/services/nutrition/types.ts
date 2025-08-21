export type FoodItem = {
  id: string;
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export interface NutritionProvider {
  searchFood(query: string): Promise<FoodItem[]>;
  lookupBarcode(barcode: string): Promise<FoodItem | null>;
}

