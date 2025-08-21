import axios from 'axios';
import { FoodItem, NutritionProvider } from './types';

const APP_ID = process.env.EXPO_PUBLIC_NUTRITIONIX_APP_ID;
const APP_KEY = process.env.EXPO_PUBLIC_NUTRITIONIX_APP_KEY;

const client = axios.create({
  baseURL: 'https://trackapi.nutritionix.com/v2',
  headers: {
    'x-app-id': APP_ID || '',
    'x-app-key': APP_KEY || '',
  },
});

export class NutritionixProvider implements NutritionProvider {
  async searchFood(query: string): Promise<FoodItem[]> {
    const res = await client.post('/natural/nutrients', { query });
    const foods = res.data?.foods ?? [];
    return foods.map((f: any, idx: number) => ({
      id: String(f.tag_id ?? idx),
      name: f.food_name,
      brand: f.brand_name,
      calories: Number(f.nf_calories ?? 0),
      protein: Number(f.nf_protein ?? 0),
      carbs: Number(f.nf_total_carbohydrate ?? 0),
      fat: Number(f.nf_total_fat ?? 0),
    }));
  }

  async lookupBarcode(barcode: string): Promise<FoodItem | null> {
    const res = await client.get(`/search/item?upc=${encodeURIComponent(barcode)}`);
    const hit = res.data?.foods?.[0];
    if (!hit) return null;
    return {
      id: String(hit.tag_id ?? barcode),
      name: hit.food_name,
      brand: hit.brand_name,
      calories: Number(hit.nf_calories ?? 0),
      protein: Number(hit.nf_protein ?? 0),
      carbs: Number(hit.nf_total_carbohydrate ?? 0),
      fat: Number(hit.nf_total_fat ?? 0),
    };
  }
}

