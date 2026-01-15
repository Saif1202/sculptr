# Firebase Functions for Sculptr

## Setup

1. **Login to Firebase:**
   ```bash
   firebase login
   ```

2. **Initialize Functions (if not already done):**
   ```bash
   firebase init functions
   ```
   - Select TypeScript
   - Select Node 20
   - Say yes to ESLint (optional)

3. **Set OpenAI API Key (using Firebase Secrets):**
   ```bash
   firebase functions:secrets:set OPENAI_API_KEY
   ```
   Enter your OpenAI API key when prompted.
   
   The secret will be automatically available to the function via `defineSecret('OPENAI_API_KEY')`.

4. **Deploy the function:**
   ```bash
   firebase deploy --only functions:chatCoach
   ```

## Functions

### chatCoach

A callable function that provides AI-powered fitness coaching.

**Input:**
```typescript
{
  messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
  tier: 'free' | 'premium',
  profile?: any,
  targets?: any
}
```

**Output:**
```typescript
{
  message: string
}
```

**Behavior:**
- Free tier: General Q&A, no plan modifications
- Premium tier: Can reason about and propose plan adjustments

## Development

- Build: `npm run build`
- Serve locally: `npm run serve`
- Deploy: `npm run deploy`

