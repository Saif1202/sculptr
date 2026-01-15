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

