import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MealItem = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type Meal = {
  id: string;
  name: string;
  items: MealItem[];
};

export type Targets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type MealState = {
  meals: Meal[];
  targets: Targets;
  addMeal: (meal: Meal) => void;
  addItem: (mealId: string, item: MealItem) => void;
  removeItem: (mealId: string, itemId: string) => void;
  totals: () => Targets;
  overUnderStatus: () => { delta: number; status: 'ok'|'over'|'under' };
};

export const useMealStore = create<MealState>()(
  persist(
    (set, get) => ({
      meals: [],
      targets: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
      addMeal: (meal) => set((s) => ({ meals: [...s.meals, meal] })),
      addItem: (mealId, item) => set((s) => ({
        meals: s.meals.map((m) => m.id === mealId ? { ...m, items: [...m.items, item] } : m),
      })),
      removeItem: (mealId, itemId) => set((s) => ({
        meals: s.meals.map((m) => m.id === mealId ? { ...m, items: m.items.filter(i => i.id !== itemId) } : m),
      })),
      totals: () => {
        const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        for (const meal of get().meals) {
          for (const i of meal.items) {
            totals.calories += i.calories;
            totals.protein += i.protein;
            totals.carbs += i.carbs;
            totals.fat += i.fat;
          }
        }
        return totals;
      },
      overUnderStatus: () => {
        const t = get().targets;
        const u = get().totals();
        const delta = u.calories - t.calories;
        if (delta > 50) return { delta, status: 'over' };
        if (delta < -75) return { delta, status: 'under' };
        return { delta, status: 'ok' };
      },
    }),
    { name: 'meal-store' }
  )
);

