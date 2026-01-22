import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import OpenAI from 'openai';

// Set global options for all functions
setGlobalOptions({
  region: 'europe-west2',
});

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatCoachInput {
  messages: ChatMessage[];
  tier: 'free' | 'premium';
  profile?: any;
  targets?: any;
}

interface ChatCoachResponse {
  text: string;
}

interface GenerateWorkoutProgramInput {
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

interface WorkoutExercise {
  exerciseId: string;
  name: string;
  unit: 'kg' | 'lb';
  targetSets: number;
  repTarget?: string | null;
  restSec?: number | null;
  rpeTarget?: number | null;
  notes?: string | null;
}

interface GeneratedWorkout {
  name: string;
  goal?: string | null;
  tags?: string[];
  type: 'strength' | 'cardio';
  exercises?: WorkoutExercise[];
  cardio?: any | null;
}

interface GenerateWorkoutProgramResponse {
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

interface GenerateMealPlanInput {
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

interface MealPlanDay {
  meals: Array<{
    name: string;
    time: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatsG: number;
    ingredients?: string[];
    instructions?: string;
  }>;
}

interface GenerateMealPlanResponse {
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

// Define secret for OpenAI API key
const openaiApiKey = defineSecret('OPENAI_API_KEY');

// Function to get OpenAI client (initialized per request to avoid module-level initialization issues)
function getOpenAIClient(): OpenAI {
  try {
    let apiKey = openaiApiKey.value();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY secret is not configured');
    }
    
    // Trim whitespace and newlines that might have been added when setting the secret
    apiKey = apiKey.trim();
    
    // Validate the API key format
    if (!apiKey.startsWith('sk-')) {
      console.warn('API key does not start with sk-, but continuing anyway');
    }
    
    console.log('API key length:', apiKey.length);
    console.log('API key starts with:', apiKey.substring(0, 7));
    
    return new OpenAI({
      apiKey,
      timeout: 30000, // 30 second timeout
      maxRetries: 2,
    });
  } catch (error) {
    console.error('Error initializing OpenAI client:', error);
    throw new Error('Failed to initialize OpenAI client. Make sure OPENAI_API_KEY secret is set.');
  }
}

/**
 * Build system prompt based on tier
 */
function buildSystemPrompt(tier: 'free' | 'premium', profile?: any, targets?: any): string {
  if (tier === 'free') {
    return `You are Sculptr Lite. Be concise. General Q&A only. Do not change or prescribe plans.`;
  } else {
    // Premium tier - exact prompt as specified
    return `You are Sculptr Pro. You may reason about plans and propose adjustments ONLY within Sculptr rules (BMR: Mifflin-St Jeor; activity multipliers 1.2/1.4/1.5/1.7; Fat Loss −300; Muscle +200; S&C +100; Maintenance 0; Fat Loss rest days: −200 kcal; when reducing calories for Fat Loss, shift carbs only).`;
  }
}

/**
 * Chat Coach callable function
 */
export const chatCoach = onCall(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [openaiApiKey],
  },
  async (request): Promise<ChatCoachResponse> => {
    const data = request.data as ChatCoachInput;
    const auth = request.auth;
    
    // Verify authentication
    if (!auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated to use chat coach'
      );
    }

    // Validate input
    if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Messages array is required and must not be empty'
      );
    }

    if (!data.tier || (data.tier !== 'free' && data.tier !== 'premium')) {
      throw new HttpsError(
        'invalid-argument',
        'Tier must be either "free" or "premium"'
      );
    }

    try {
      // Build system prompt
      const systemPrompt = buildSystemPrompt(data.tier, data.profile, data.targets);

      // Prepare messages for OpenAI (include system message)
      const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...data.messages.map((msg): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
          if (msg.role === 'user') {
            return { role: 'user', content: msg.content };
          } else if (msg.role === 'assistant') {
            return { role: 'assistant', content: msg.content };
          } else {
            return { role: 'system', content: msg.content };
          }
        }),
      ];

      // Call OpenAI
      const client = getOpenAIClient();
      
      console.log('Calling OpenAI with model: gpt-4o-mini');
      console.log('Number of messages:', openaiMessages.length);
      
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 500,
      });
      
      console.log('OpenAI response received');

      const assistantMessage = completion.choices[0]?.message?.content;

      if (!assistantMessage) {
        throw new Error('No response from OpenAI');
      }

      return {
        text: assistantMessage,
      };
    } catch (error: any) {
      console.error('Error in chatCoach:', error);
      console.error('Error stack:', error.stack);
      
      // Handle OpenAI-specific errors
      if (error instanceof OpenAI.APIError) {
        console.error('OpenAI API Error:', error.status, error.message);
        throw new HttpsError(
          'internal',
          `OpenAI API error: ${error.message || 'Connection error'}`
        );
      }
      
      // Handle network/connection errors
      if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('connection')) {
        console.error('Network/Connection error detected');
        throw new HttpsError(
          'internal',
          `Connection error: ${error.message || 'Failed to connect to OpenAI'}`
        );
      }
      
      throw new HttpsError(
        'internal',
        error.message || 'An error occurred while processing your request'
      );
    }
  }
);

/**
 * Generate AI workout program based on user profile and goals
 */
export const generateWorkoutProgram = onCall(
  {
    timeoutSeconds: 120,
    memory: '1GiB',
    secrets: [openaiApiKey],
  },
  async (request): Promise<GenerateWorkoutProgramResponse> => {
    const data = request.data as GenerateWorkoutProgramInput;
    const auth = request.auth;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!data.profile) {
      throw new HttpsError('invalid-argument', 'Profile is required');
    }

    try {
      const client = getOpenAIClient();
      
      const systemPrompt = `You are an expert fitness coach creating personalized workout programs. 
Generate a complete workout program as JSON with the following structure:
{
  "workouts": [
    {
      "name": "Workout Name",
      "goal": "Fat Loss" | "Muscle Gain" | "Strength & Conditioning" | "Maintenance" | null,
      "tags": ["tag1", "tag2"],
      "type": "strength" | "cardio",
      "exercises": [
        {
          "exerciseId": "unique-id",
          "name": "Exercise Name",
          "unit": "kg" | "lb",
          "targetSets": 3,
          "repTarget": "8-12" | null,
          "restSec": 90 | null,
          "rpeTarget": 7 | null,
          "notes": "Optional notes" | null
        }
      ],
      "cardio": null
    }
  ],
  "schedule": {
    "Mon": "workout-id-1",
    "Tue": "workout-id-2",
    ...
  }
}

Rules:
- Create 3-6 workouts based on user's goal and preferences
- For strength workouts, include 4-8 exercises targeting different muscle groups
- Use appropriate rep ranges: Fat Loss (12-15), Muscle Gain (8-12), Strength (4-6)
- Include proper rest periods (60-180 seconds)
- Match exercises to available equipment
- Create a balanced weekly schedule
- Use exercise names that are common and recognizable`;

      const userPrompt = `Create a workout program for:
Goal: ${data.profile.goal || 'Not specified'}
Sex: ${data.profile.sex || 'Not specified'}
Weight: ${data.profile.weightKg || 'Not specified'} kg
Height: ${data.profile.heightCm || 'Not specified'} cm
Age: ${data.profile.age || 'Not specified'}
Activity Level: ${data.profile.activity || 'Not specified'}
${data.preferences ? `Preferences: ${JSON.stringify(data.preferences)}` : ''}

Generate a complete program with workouts and weekly schedule.`;

      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(responseText) as GenerateWorkoutProgramResponse;
      return parsed;
    } catch (error: any) {
      console.error('Error in generateWorkoutProgram:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to generate workout program'
      );
    }
  }
);

/**
 * Generate AI meal plan based on user profile, targets, and preferences
 */
export const generateMealPlan = onCall(
  {
    timeoutSeconds: 120,
    memory: '1GiB',
    secrets: [openaiApiKey],
  },
  async (request): Promise<GenerateMealPlanResponse> => {
    const data = request.data as GenerateMealPlanInput;
    const auth = request.auth;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!data.profile || !data.targets) {
      throw new HttpsError('invalid-argument', 'Profile and targets are required');
    }

    try {
      const client = getOpenAIClient();
      
      const systemPrompt = `You are an expert nutritionist creating personalized meal plans. 
Generate a complete 7-day meal plan as JSON with the following structure:
{
  "plan": {
    "Mon": {
      "meals": [
        {
          "name": "Meal Name",
          "time": "08:00",
          "calories": 500,
          "proteinG": 30,
          "carbsG": 50,
          "fatsG": 20,
          "ingredients": ["ingredient1", "ingredient2"],
          "instructions": "Cooking instructions"
        }
      ]
    },
    ... (Tue through Sun)
  },
  "totalCalories": 2000,
  "totalProtein": 150,
  "totalCarbs": 200,
  "totalFats": 65
}

Rules:
- Create 3-5 meals per day (breakfast, lunch, dinner, snacks)
- Total daily macros must match targets closely (±5%)
- Include variety across the week
- Use realistic, common foods
- Provide ingredients and basic cooking instructions
- Consider dietary restrictions and preferences
- Ensure meals are balanced and nutritious`;

      const userPrompt = `Create a 7-day meal plan for:
Goal: ${data.profile.goal || 'Not specified'}
Targets: ${data.targets.calories} calories, ${data.targets.proteinG}g protein, ${data.targets.carbsG}g carbs, ${data.targets.fatsG}g fats
${data.preferences ? `Preferences: ${JSON.stringify(data.preferences)}` : ''}

Generate a complete weekly meal plan that matches the targets.`;

      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(responseText) as GenerateMealPlanResponse;
      return parsed;
    } catch (error: any) {
      console.error('Error in generateMealPlan:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to generate meal plan'
      );
    }
  }
);

