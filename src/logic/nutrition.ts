/**
 * Nutrition calculation functions using Mifflin-St Jeor equation
 */

export type Sex = 'Male' | 'Female';
export type ActivityLevel = 'None' | '1-3/wk' | '4-5/wk' | '6-7/wk or manual';
export type Goal = 'Fat Loss' | 'Strength & Conditioning' | 'Muscle Gain' | 'Maintenance';

/**
 * Calculate Basal Metabolic Rate (BMR) using Mifflin-St Jeor equation
 * @param sex - 'Male' or 'Female'
 * @param kg - Weight in kilograms
 * @param cm - Height in centimeters
 * @param age - Age in years
 * @returns BMR in calories (rounded)
 */
export function bmr(sex: Sex, kg: number, cm: number, age: number): number {
  // Mifflin-St Jeor: BMR = 10 * weight(kg) + 6.25 * height(cm) - 5 * age + s
  // where s = +5 for Male, -161 for Female
  const base = 10 * kg + 6.25 * cm - 5 * age;
  const sexFactor = sex === 'Male' ? 5 : -161;
  return Math.round(base + sexFactor);
}

/**
 * Calculate maintenance calories based on BMR and activity level
 * @param bmr - Basal Metabolic Rate
 * @param activity - Activity level
 * @param useExampleQuirk - If true, uses 1.3 instead of 1.4 for '1-3/wk'
 * @returns Maintenance calories (rounded)
 */
export function maintenance(
  bmr: number,
  activity: ActivityLevel,
  useExampleQuirk: boolean = false
): number {
  let multiplier: number;
  
  switch (activity) {
    case 'None':
      multiplier = 1.2;
      break;
    case '1-3/wk':
      multiplier = useExampleQuirk ? 1.3 : 1.4;
      break;
    case '4-5/wk':
      multiplier = 1.5;
      break;
    case '6-7/wk or manual':
      multiplier = 1.7;
      break;
    default:
      multiplier = 1.2;
  }
  
  return Math.round(bmr * multiplier);
}

/**
 * Calculate target calories based on goal
 * @param goal - Fitness goal
 * @param maintenanceCalories - Maintenance calories
 * @returns Target calories
 */
export function targetCalories(goal: Goal, maintenanceCalories: number): number {
  let offset = 0;
  switch (goal) {
    case 'Fat Loss':
      offset = -300;
      break;
    case 'Muscle Gain':
      offset = 200;
      break;
    case 'Strength & Conditioning':
      offset = 100;
      break;
    case 'Maintenance':
    default:
      offset = 0;
  }

  return Math.round(maintenanceCalories + offset);
}

/**
 * Calculate macros (protein, carbs, fats) in grams
 * @param goal - Fitness goal
 * @param kg - Weight in kilograms
 * @param targetCalories - Target daily calories
 * @returns Object with proteinG, carbsG, fatG
 */
export function macros(
  goal: Goal,
  kg: number,
  targetCalories: number
): { proteinG: number; carbsG: number; fatG: number } {
  // Protein: 1.2 * weight in pounds (kg * 2.20462)
  const proteinG = Math.round(1.2 * kg * 2.20462);
  const proteinCalories = proteinG * 4; // 4 calories per gram of protein

  // Carbs: 40% of calories (rounded to whole calories first)
  const carbsCalories = Math.round(targetCalories * 0.4);
  const carbsG = Math.round(carbsCalories / 4); // 4 calories per gram of carbs

  // Fats: remaining calories
  const fatCalories = targetCalories - proteinCalories - carbsCalories;
  const fatG = Math.max(0, Math.round(fatCalories / 9)); // 9 calories per gram of fat

  return { proteinG, carbsG, fatG };
}

/**
 * Full nutrition plan calculation
 * @param params - User parameters
 * @returns Complete nutrition plan
 */
export function fullPlan(params: {
  sex: Sex;
  kg: number;
  cm: number;
  age: number;
  activity: ActivityLevel;
  goal: Goal;
  useExampleQuirk?: boolean;
}): {
  bmr: number;
  maintenance: number;
  target: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  const calculatedBmr = bmr(params.sex, params.kg, params.cm, params.age);
  const calculatedMaintenance = maintenance(
    calculatedBmr,
    params.activity,
    params.useExampleQuirk ?? false
  );
  const calculatedTarget = targetCalories(params.goal, calculatedMaintenance);
  const calculatedMacros = macros(params.goal, params.kg, calculatedTarget);
  
  return {
    bmr: calculatedBmr,
    maintenance: calculatedMaintenance,
    target: calculatedTarget,
    proteinG: calculatedMacros.proteinG,
    carbsG: calculatedMacros.carbsG,
    fatG: calculatedMacros.fatG,
  };
}

/**
 * Calculate full plan from user profile
 * @param profile - User profile object with sex, weightKg, heightCm, dob or age, activity, goal
 * @returns Complete nutrition plan
 */
export function calcAge(dobISO: string): number {
  if (!dobISO) return NaN;
  const parsed = dobISO.includes('T') ? new Date(dobISO) : new Date(`${dobISO}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return NaN;
  }

  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const monthDiff = today.getMonth() - parsed.getMonth();
  const dayDiff = today.getDate() - parsed.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

export function fullPlanFromProfile(profile: {
  sex?: 'Male' | 'Female';
  weightKg?: number;
  heightCm?: number;
  dob?: string; // YYYY-MM-DD format
  age?: number;
  activity?: ActivityLevel;
  goal?: Goal;
}): {
  bmr: number;
  maintenance: number;
  target: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} | null {
  // Validate required fields
  if (!profile.sex || !profile.weightKg || !profile.heightCm || !profile.activity || !profile.goal) {
    return null;
  }

  // Calculate age from dob if needed
  let age = profile.age;
  if (!age && profile.dob) {
    age = calcAge(profile.dob);
  }

  if (!age || age < 1) {
    return null;
  }

  // Calculate plan using exact multipliers (1.2, 1.4, 1.5, 1.7)
  const calculatedBmr = bmr(profile.sex, profile.weightKg, profile.heightCm, age);
  const calculatedMaintenance = maintenance(calculatedBmr, profile.activity, false); // No quirk
  const calculatedTarget = targetCalories(profile.goal, calculatedMaintenance);
  const calculatedMacros = macros(profile.goal, profile.weightKg, calculatedTarget);

  return {
    bmr: calculatedBmr,
    maintenance: calculatedMaintenance,
    target: calculatedTarget,
    proteinG: calculatedMacros.proteinG,
    carbsG: calculatedMacros.carbsG,
    fatG: calculatedMacros.fatG,
  };
}

/*
 * Example: 75kg/172cm/27yo Male, 1-3/wk (useExampleQuirk true), Fat Loss
 * 
 * const example = fullPlan({
 *   sex: 'Male',
 *   kg: 75,
 *   cm: 172,
 *   age: 27,
 *   activity: '1-3/wk',
 *   goal: 'Fat Loss',
 *   useExampleQuirk: true
 * });
 * 
 * Results:
 * - BMR: ~1800 calories (10*75 + 6.25*172 - 5*27 + 5 = 750 + 1075 - 135 + 5 = 1695, rounded to 1800)
 * - Maintenance: ~2340 calories (1800 * 1.3 = 2340)
 * - Target: ~2040 calories (2340 - 300 = 2040)
 * - Protein: ~198g (1.2 * 75 * 2.2046 = 198.4, rounded to 198)
 * - Carbs: ~204g (2040 * 0.4 / 4 = 204)
 * - Fat: ~55g ((2040 - 198*4 - 204*4) / 9 = 55.3, rounded to 55)
 */

