import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCoachPayload {
  messages: ChatMessage[];
  tier: 'free' | 'premium';
  profile?: any;
  targets?: any;
}

export interface ChatCoachResponse {
  text: string;
}

export interface GenerateWorkoutProgramPayload {
  profile: {
    goal?: string;
    sex?: string;
    weightKg?: number;
    heightCm?: number;
    age?: number;
    activity?: string;
  };
  preferences?: {
    daysPerWeek?: number;
    equipment?: string[];
    focusAreas?: string[];
    experience?: 'beginner' | 'intermediate' | 'advanced';
  };
}

export interface WorkoutExercise {
  exerciseId: string;
  name: string;
  unit: 'kg' | 'lb';
  targetSets: number;
  repTarget?: string | null;
  restSec?: number | null;
  rpeTarget?: number | null;
  notes?: string | null;
}

export interface GeneratedWorkout {
  name: string;
  goal?: string | null;
  tags?: string[];
  type: 'strength' | 'cardio';
  exercises?: WorkoutExercise[];
  cardio?: any | null;
}

export interface GenerateWorkoutProgramResponse {
  workouts: GeneratedWorkout[];
  schedule?: {
    Mon?: string;
    Tue?: string;
    Wed?: string;
    Thu?: string;
    Fri?: string;
    Sat?: string;
    Sun?: string;
  };
}

export interface GenerateMealPlanPayload {
  profile: {
    goal?: string;
    sex?: string;
    weightKg?: number;
    heightCm?: number;
    age?: number;
    activity?: string;
  };
  targets: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatsG: number;
  };
  preferences?: {
    dietaryRestrictions?: string[];
    mealCount?: number;
    cuisinePreferences?: string[];
  };
}

export interface MealPlanMeal {
  name: string;
  time: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  ingredients?: Array<{
    name: string;
    amount: string;
    unit?: string;
  }>;
  instructions?: string;
}

export interface MealPlanDay {
  meals: MealPlanMeal[];
}

export interface GenerateMealPlanResponse {
  plan: {
    Mon: MealPlanDay;
    Tue: MealPlanDay;
    Wed: MealPlanDay;
    Thu: MealPlanDay;
    Fri: MealPlanDay;
    Sat: MealPlanDay;
    Sun: MealPlanDay;
  };
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
}

/**
 * Call the chatCoach Firebase callable function
 * @param payload - Chat payload with messages, tier, profile, and targets
 * @returns Assistant's response text
 */
export async function callChatCoach(payload: ChatCoachPayload): Promise<string> {
  try {
    const chatCoach = httpsCallable<ChatCoachPayload, ChatCoachResponse>(functions, 'chatCoach');
    const result = await chatCoach(payload);
    return result.data.text;
  } catch (error: any) {
    // Log full error details for debugging
    console.error('Chat coach error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error details:', error.details);
    
    // Extract more detailed error message
    const errorMessage = error.message || error.details?.message || 'Failed to get response from chat coach';
    throw new Error(errorMessage);
  }
}

/**
 * Generate AI workout program
 * @param payload - User profile and preferences
 * @returns Generated workout program with workouts and schedule
 */
export async function generateWorkoutProgram(payload: GenerateWorkoutProgramPayload): Promise<GenerateWorkoutProgramResponse> {
  try {
    const generateWorkout = httpsCallable<GenerateWorkoutProgramPayload, GenerateWorkoutProgramResponse>(
      functions,
      'generateWorkoutProgram'
    );
    const result = await generateWorkout(payload);
    return result.data;
  } catch (error: any) {
    console.error('Generate workout program error:', error);
    console.error('Error code:', error.code);
    console.error('Error details:', error.details);
    
    // Handle function not found error
    if (error.code === 'not-found' || error.message?.includes('not found') || error.message?.includes('NOT_FOUND')) {
      throw new Error('AI workout generation is not available yet. Please deploy Firebase Functions or use the preset plans.');
    }
    
    // Handle timeout/deadline errors
    if (error.code === 'deadline-exceeded' || error.message?.includes('deadline') || error.message?.includes('timeout')) {
      throw new Error('Workout generation timed out. Please try again or use preset workouts.');
    }
    
    const errorMessage = error.message || error.details?.message || 'Failed to generate workout program';
    throw new Error(errorMessage);
  }
}

/**
 * Generate AI meal plan
 * @param payload - User profile, targets, and preferences
 * @returns Generated 7-day meal plan
 */
export async function generateMealPlan(payload: GenerateMealPlanPayload): Promise<GenerateMealPlanResponse> {
  try {
    const generateMeal = httpsCallable<GenerateMealPlanPayload, GenerateMealPlanResponse>(
      functions,
      'generateMealPlan'
    );
    const result = await generateMeal(payload);
    return result.data;
  } catch (error: any) {
    console.error('Generate meal plan error:', error);
    console.error('Error code:', error.code);
    console.error('Error details:', error.details);
    
    // Handle function not found error
    if (error.code === 'not-found' || error.message?.includes('not found') || error.message?.includes('NOT_FOUND')) {
      throw new Error('AI meal plan generation is not available yet. Please deploy Firebase Functions or use the preset plans.');
    }
    
    // Handle timeout/deadline errors
    if (error.code === 'deadline-exceeded' || error.message?.includes('deadline') || error.message?.includes('timeout')) {
      throw new Error('Meal plan generation timed out. Please try again or use preset meal plans.');
    }
    
    const errorMessage = error.message || error.details?.message || 'Failed to generate meal plan';
    throw new Error(errorMessage);
  }
}

