import axios from 'axios';
import { FoodItem, NutritionProvider } from './types';

const client = axios.create({ baseURL: 'https://world.openfoodfacts.org' });

export class OpenFoodFactsProvider implements NutritionProvider {
  async searchFood(query: string): Promise<FoodItem[]> {
    const res = await client.get('/cgi/search.pl', {
      params: { search_terms: query, search_simple: 1, action: 'process', json: 1, page_size: 10 },
    });
    const prods = res.data?.products ?? [];
    return prods.map((p: any) => this.mapProduct(p)).filter(Boolean) as FoodItem[];
  }

  async lookupBarcode(barcode: string): Promise<FoodItem | null> {
    const res = await client.get(`/api/v0/product/${barcode}.json`);
    const p = res.data?.product;
    if (!p) return null;
    return this.mapProduct(p);
  }

  private mapProduct(p: any): FoodItem | null {
    const nutr = p.nutriments || {};
    const name = p.product_name || p.generic_name || p.brands_tags?.[0];
    if (!name) return null;
    return {
      id: String(p._id || p.code || name),
      name,
      brand: p.brands,
      calories: Number(nutr['energy-kcal_100g'] ?? nutr['energy-kcal'] ?? 0),
      protein: Number(nutr.proteins_100g ?? 0),
      carbs: Number(nutr.carbohydrates_100g ?? 0),
      fat: Number(nutr.fat_100g ?? 0),
    };
  }
}

