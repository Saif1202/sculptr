export interface PresetMeal {
  name: string;
  time: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  ingredients?: string[];
  instructions?: string;
}

export interface PresetMealPlanDay {
  meals: PresetMeal[];
}

export interface PresetMealPlan {
  id: string;
  name: string;
  description: string;
  goal: 'Fat Loss' | 'Muscle Gain' | 'Strength & Conditioning' | 'Maintenance';
  plan: {
    Mon: PresetMealPlanDay;
    Tue: PresetMealPlanDay;
    Wed: PresetMealPlanDay;
    Thu: PresetMealPlanDay;
    Fri: PresetMealPlanDay;
    Sat: PresetMealPlanDay;
    Sun: PresetMealPlanDay;
  };
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
}

export const PRESET_MEAL_PLANS: PresetMealPlan[] = [
  {
    id: 'fat-loss-balanced',
    name: 'Balanced Fat Loss',
    description: 'A well-rounded meal plan for sustainable fat loss with balanced macros',
    goal: 'Fat Loss',
    plan: {
      Mon: {
        meals: [
          { name: 'Greek Yogurt with Berries', time: '08:00', calories: 250, proteinG: 20, carbsG: 30, fatsG: 5 },
          { name: 'Grilled Chicken Salad', time: '12:30', calories: 400, proteinG: 35, carbsG: 25, fatsG: 15 },
          { name: 'Apple with Almonds', time: '15:00', calories: 200, proteinG: 5, carbsG: 20, fatsG: 12 },
          { name: 'Salmon with Vegetables', time: '19:00', calories: 450, proteinG: 40, carbsG: 20, fatsG: 20 },
        ],
      },
      Tue: {
        meals: [
          { name: 'Oatmeal with Protein', time: '08:00', calories: 300, proteinG: 25, carbsG: 45, fatsG: 8 },
          { name: 'Turkey Wrap', time: '12:30', calories: 380, proteinG: 30, carbsG: 35, fatsG: 12 },
          { name: 'Protein Shake', time: '15:00', calories: 180, proteinG: 25, carbsG: 10, fatsG: 3 },
          { name: 'Lean Beef with Sweet Potato', time: '19:00', calories: 420, proteinG: 35, carbsG: 30, fatsG: 15 },
        ],
      },
      Wed: {
        meals: [
          { name: 'Scrambled Eggs with Toast', time: '08:00', calories: 280, proteinG: 20, carbsG: 25, fatsG: 12 },
          { name: 'Tuna Salad', time: '12:30', calories: 350, proteinG: 30, carbsG: 20, fatsG: 15 },
          { name: 'Greek Yogurt', time: '15:00', calories: 150, proteinG: 15, carbsG: 15, fatsG: 3 },
          { name: 'Chicken Stir Fry', time: '19:00', calories: 400, proteinG: 35, carbsG: 30, fatsG: 12 },
        ],
      },
      Thu: {
        meals: [
          { name: 'Protein Pancakes', time: '08:00', calories: 320, proteinG: 30, carbsG: 40, fatsG: 8 },
          { name: 'Chicken Quinoa Bowl', time: '12:30', calories: 420, proteinG: 35, carbsG: 45, fatsG: 10 },
          { name: 'Mixed Nuts', time: '15:00', calories: 200, proteinG: 6, carbsG: 8, fatsG: 16 },
          { name: 'Baked Cod with Vegetables', time: '19:00', calories: 380, proteinG: 35, carbsG: 25, fatsG: 15 },
        ],
      },
      Fri: {
        meals: [
          { name: 'Smoothie Bowl', time: '08:00', calories: 280, proteinG: 20, carbsG: 35, fatsG: 8 },
          { name: 'Grilled Chicken Breast', time: '12:30', calories: 350, proteinG: 40, carbsG: 15, fatsG: 12 },
          { name: 'Rice Cakes with Peanut Butter', time: '15:00', calories: 180, proteinG: 8, carbsG: 20, fatsG: 8 },
          { name: 'Turkey Meatballs with Pasta', time: '19:00', calories: 450, proteinG: 35, carbsG: 40, fatsG: 15 },
        ],
      },
      Sat: {
        meals: [
          { name: 'Avocado Toast with Eggs', time: '08:00', calories: 320, proteinG: 18, carbsG: 30, fatsG: 15 },
          { name: 'Salmon Salad', time: '12:30', calories: 400, proteinG: 30, carbsG: 20, fatsG: 20 },
          { name: 'Protein Bar', time: '15:00', calories: 200, proteinG: 20, carbsG: 20, fatsG: 5 },
          { name: 'Lean Steak with Vegetables', time: '19:00', calories: 420, proteinG: 40, carbsG: 15, fatsG: 18 },
        ],
      },
      Sun: {
        meals: [
          { name: 'Protein Waffles', time: '08:00', calories: 300, proteinG: 25, carbsG: 35, fatsG: 8 },
          { name: 'Chicken Caesar Salad', time: '12:30', calories: 380, proteinG: 30, carbsG: 25, fatsG: 18 },
          { name: 'Cottage Cheese with Fruit', time: '15:00', calories: 180, proteinG: 20, carbsG: 15, fatsG: 5 },
          { name: 'Baked Chicken with Rice', time: '19:00', calories: 440, proteinG: 40, carbsG: 40, fatsG: 12 },
        ],
      },
    },
    totalCalories: 1300,
    totalProtein: 120,
    totalCarbs: 130,
    totalFats: 45,
  },
  {
    id: 'muscle-gain-high-protein',
    name: 'High Protein Muscle Gain',
    description: 'High-calorie, high-protein plan designed for muscle building',
    goal: 'Muscle Gain',
    plan: {
      Mon: {
        meals: [
          { name: 'Protein Oatmeal with Banana', time: '08:00', calories: 450, proteinG: 30, carbsG: 60, fatsG: 10 },
          { name: 'Chicken and Rice', time: '12:30', calories: 600, proteinG: 50, carbsG: 70, fatsG: 15 },
          { name: 'Protein Shake', time: '15:00', calories: 250, proteinG: 30, carbsG: 25, fatsG: 5 },
          { name: 'Beef with Potatoes', time: '19:00', calories: 650, proteinG: 55, carbsG: 60, fatsG: 20 },
          { name: 'Casein Protein', time: '21:30', calories: 200, proteinG: 25, carbsG: 5, fatsG: 3 },
        ],
      },
      Tue: {
        meals: [
          { name: 'Egg Scramble with Toast', time: '08:00', calories: 500, proteinG: 35, carbsG: 55, fatsG: 15 },
          { name: 'Turkey and Pasta', time: '12:30', calories: 620, proteinG: 45, carbsG: 75, fatsG: 18 },
          { name: 'Greek Yogurt with Granola', time: '15:00', calories: 300, proteinG: 20, carbsG: 40, fatsG: 8 },
          { name: 'Salmon with Sweet Potato', time: '19:00', calories: 600, proteinG: 50, carbsG: 65, fatsG: 20 },
          { name: 'Cottage Cheese', time: '21:30', calories: 180, proteinG: 25, carbsG: 8, fatsG: 2 },
        ],
      },
      Wed: {
        meals: [
          { name: 'Protein Pancakes', time: '08:00', calories: 480, proteinG: 35, carbsG: 60, fatsG: 12 },
          { name: 'Chicken Quinoa Bowl', time: '12:30', calories: 580, proteinG: 50, carbsG: 70, fatsG: 15 },
          { name: 'Protein Bar', time: '15:00', calories: 280, proteinG: 25, carbsG: 30, fatsG: 8 },
          { name: 'Lean Beef with Rice', time: '19:00', calories: 640, proteinG: 55, carbsG: 65, fatsG: 18 },
          { name: 'Casein Shake', time: '21:30', calories: 220, proteinG: 30, carbsG: 10, fatsG: 4 },
        ],
      },
      Thu: {
        meals: [
          { name: 'Smoothie with Protein', time: '08:00', calories: 450, proteinG: 30, carbsG: 55, fatsG: 10 },
          { name: 'Tuna Pasta', time: '12:30', calories: 600, proteinG: 45, carbsG: 75, fatsG: 15 },
          { name: 'Mixed Nuts and Dried Fruit', time: '15:00', calories: 320, proteinG: 10, carbsG: 35, fatsG: 18 },
          { name: 'Chicken with Potatoes', time: '19:00', calories: 620, proteinG: 50, carbsG: 70, fatsG: 15 },
          { name: 'Greek Yogurt', time: '21:30', calories: 210, proteinG: 20, carbsG: 15, fatsG: 5 },
        ],
      },
      Fri: {
        meals: [
          { name: 'Avocado Toast with Eggs', time: '08:00', calories: 480, proteinG: 28, carbsG: 50, fatsG: 18 },
          { name: 'Salmon and Rice', time: '12:30', calories: 580, proteinG: 50, carbsG: 65, fatsG: 20 },
          { name: 'Protein Shake', time: '15:00', calories: 250, proteinG: 30, carbsG: 25, fatsG: 5 },
          { name: 'Turkey Meatballs with Pasta', time: '19:00', calories: 640, proteinG: 48, carbsG: 75, fatsG: 18 },
          { name: 'Casein Protein', time: '21:30', calories: 200, proteinG: 25, carbsG: 5, fatsG: 3 },
        ],
      },
      Sat: {
        meals: [
          { name: 'Breakfast Burrito', time: '08:00', calories: 520, proteinG: 35, carbsG: 60, fatsG: 15 },
          { name: 'Steak with Sweet Potato', time: '12:30', calories: 650, proteinG: 55, carbsG: 70, fatsG: 20 },
          { name: 'Trail Mix', time: '15:00', calories: 300, proteinG: 8, carbsG: 30, fatsG: 18 },
          { name: 'Baked Cod with Rice', time: '19:00', calories: 580, proteinG: 50, carbsG: 65, fatsG: 15 },
          { name: 'Cottage Cheese', time: '21:30', calories: 200, proteinG: 25, carbsG: 10, fatsG: 2 },
        ],
      },
      Sun: {
        meals: [
          { name: 'Protein Waffles', time: '08:00', calories: 480, proteinG: 32, carbsG: 60, fatsG: 12 },
          { name: 'Chicken Caesar Wrap', time: '12:30', calories: 580, proteinG: 45, carbsG: 55, fatsG: 20 },
          { name: 'Protein Smoothie', time: '15:00', calories: 280, proteinG: 30, carbsG: 30, fatsG: 6 },
          { name: 'Lean Beef with Vegetables', time: '19:00', calories: 620, proteinG: 55, carbsG: 50, fatsG: 20 },
          { name: 'Casein Shake', time: '21:30', calories: 220, proteinG: 30, carbsG: 8, fatsG: 4 },
        ],
      },
    },
    totalCalories: 2200,
    totalProtein: 180,
    totalCarbs: 240,
    totalFats: 65,
  },
];

export function getPresetMealPlansByGoal(goal?: string): PresetMealPlan[] {
  if (!goal) return PRESET_MEAL_PLANS;
  return PRESET_MEAL_PLANS.filter((plan) => plan.goal === goal);
}
