export interface Per100 {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
}

export interface FoodItem {
  label: string;
  brand?: string;
  barcode?: string;
  per100: Per100;
  defaultServingG?: number;
  tags?: string[];
  source: 'library' | 'off' | 'user';
}

const OFF_BASE = 'https://world.openfoodfacts.org';

function round(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value);
}

export function normalizeNutriments(nutriments: Record<string, any> = {}): Per100 {
  const energyKcal = nutriments['energy-kcal_100g'];
  const energyKj = nutriments['energy-kj_100g'];
  const kcal = energyKcal != null ? Number(energyKcal) : energyKj != null ? Number(energyKj) / 4.184 : 0;

  return {
    kcal: round(kcal),
    proteinG: round(Number(nutriments['proteins_100g'] ?? 0)),
    carbsG: round(Number(nutriments['carbohydrates_100g'] ?? 0)),
    fatsG: round(Number(nutriments['fat_100g'] ?? 0)),
  };
}

export async function lookupBarcodeOFF(barcode: string): Promise<FoodItem | null> {
  if (!barcode) return null;
  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const json = await response.json();
    if (json.status !== 1 || !json.product) {
      return null;
    }

    const product = json.product;
    const label = (product.product_name || product.generic_name || '').trim();
    if (!label) {
      return null;
    }

    const per100 = normalizeNutriments(product.nutriments ?? {});

    return {
      label,
      brand: product.brands || undefined,
      barcode,
      per100,
      defaultServingG: product.serving_quantity ? Number(product.serving_quantity) : undefined,
      source: 'off',
    };
  } catch (error) {
    console.warn('lookupBarcodeOFF failed', error);
    return null;
  }
}

export interface OFFSearchResult extends FoodItem {
  barcode?: string;
}

export async function searchOFF(query: string, pageSize: number = 20): Promise<OFFSearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    json: '1',
    page_size: String(pageSize),
  });

  const url = `${OFF_BASE}/cgi/search.pl?${params.toString()}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }
    const json = await response.json();
    const products: any[] = json.products ?? [];

    return products
      .map((product) => {
        const label = (product.product_name || product.generic_name || '').trim();
        if (!label) {
          return null;
        }

        return {
          label,
          brand: product.brands || undefined,
          barcode: product.code || undefined,
          per100: normalizeNutriments(product.nutriments ?? {}),
          defaultServingG: product.serving_quantity ? Number(product.serving_quantity) : undefined,
          source: 'off' as const,
        };
      })
      .filter(Boolean) as OFFSearchResult[];
  } catch (error) {
    console.warn('searchOFF failed', error);
    return [];
  }
}

export function calcPortion(per100: Per100, grams: number): Per100 {
  const ratio = grams / 100;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
  return {
    kcal: round(per100.kcal * safeRatio),
    proteinG: round(per100.proteinG * safeRatio),
    carbsG: round(per100.carbsG * safeRatio),
    fatsG: round(per100.fatsG * safeRatio),
  };
}

