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

