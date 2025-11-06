# AGENT_ID Usage in AlexListens Codebase

## Overview

The AlexListens application uses Ultravox agents to provide multi-language voice conversations. The system dynamically selects the appropriate agent based on the user's language preference (English, Spanish, or Australian English).

## Primary Usage Location

### `app/api/ultravox-call/route.ts` - Main API Route

The agent ID environment variables are used in the `/api/ultravox-call` route to determine which Ultravox agent to use for voice conversations.

#### Key Usage Points:

1. **Environment Variable Check** (Lines 6-18):
```typescript
if (!process.env.NEXT_PUBLIC_ULTRAVOX_API_KEY) {
  return NextResponse.json(
    { error: 'Server configuration error: Missing Ultravox API key' },
    { status: 500 }
  );
}

if (!process.env.NEXT_PUBLIC_AGENT_ID) {
  return NextResponse.json(
    { error: 'Server configuration error: Missing Agent ID' },
    { status: 500 }
  );
}
```

2. **Default Agent Selection** (Line 38):
```typescript
let agentId = process.env.NEXT_PUBLIC_AGENT_ID; // Default English agent
```

3. **Multi-language Agent Logic** (Lines 40-51):
```typescript
switch (alexEthnicity) {
  case 'Spanish':
    agentId = process.env.NEXT_PUBLIC_SPANISH_AGENT_ID || process.env.NEXT_PUBLIC_AGENT_ID;
    break;
  case 'Aussie':
    agentId = process.env.NEXT_PUBLIC_AUSSIE_AGENT_ID || process.env.NEXT_PUBLIC_AGENT_ID;
    break;
  case 'English':
  default:
    agentId = process.env.NEXT_PUBLIC_AGENT_ID;
    break;
}
```

4. **Ultravox API URL Construction** (Line 53):
```typescript
const apiUrl = `https://api.ultravox.ai/api/agents/${agentId}/calls`;
```

5. **API Request** (Lines 66-94):
```typescript
const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.NEXT_PUBLIC_ULTRAVOX_API_KEY,
  },
  body: JSON.stringify({
    templateContext: {
      userFirstname: firstName || 'User',
      lastCallTranscript: lastCallTranscript || 'No previous call. This is the first call',
      currentTime: currentTime || new Date().toLocaleTimeString(),
      userLocation: userLocation || 'Unknown Location',
      userTotalCalls: totalCalls?.toString() || '0'
    },
    initialMessages: [],
    metadata: {},
    medium: { webRtc: {} },
    joinTimeout: "300s",
    maxDuration: `${maxDurationSeconds}s`, // Based on user's wallet balance
    recordingEnabled: false,
    initialOutputMedium: "MESSAGE_MEDIUM_VOICE",
    firstSpeakerSettings: {
      agent: {}
    },
    experimentalSettings: {}
  }),
});
```

## How It Works

### Agent Selection Flow:
1. **Default**: Uses `NEXT_PUBLIC_AGENT_ID` for English conversations
2. **Spanish**: Uses `NEXT_PUBLIC_SPANISH_AGENT_ID` if available, falls back to `NEXT_PUBLIC_AGENT_ID`
3. **Australian**: Uses `NEXT_PUBLIC_AUSSIE_AGENT_ID` if available, falls back to `NEXT_PUBLIC_AGENT_ID`

### User Preference Detection:
- Reads user's `alexEthnicity` preference from Firestore (`users/{userId}` collection)
- This preference is set in the Dashboard (`app/dashboard/page.tsx`)
- Users can choose between "English", "Spanish", or "Aussie"
- Default value is "English" for new users (set in `components/AuthModals.tsx`)

### API Integration:
- The selected `agentId` is used to construct the Ultravox API endpoint
- Each agent ID corresponds to a different AI personality/language model
- The agent handles the actual voice conversation logic
- Maximum call duration is determined by the user's wallet balance
- Call duration is tracked and deducted from the wallet after the call ends

### Wallet Integration:
- User's wallet balance (in seconds) is passed to the API route
- `maxDuration` is set based on wallet balance + 30 second buffer
- Minimum duration is 60 seconds (1 minute)
- Balance is checked before allowing calls to start

## Environment Variables Required:

All agent-related environment variables use the `NEXT_PUBLIC_` prefix because they need to be accessible on the client side:

- `NEXT_PUBLIC_AGENT_ID` - **Required** - Default English agent
- `NEXT_PUBLIC_SPANISH_AGENT_ID` - Optional - Spanish-speaking agent
- `NEXT_PUBLIC_AUSSIE_AGENT_ID` - Optional - Australian English agent
- `NEXT_PUBLIC_ULTRAVOX_API_KEY` - **Required** - Ultravox API key

## Error Handling:

If `NEXT_PUBLIC_AGENT_ID` is missing, the API returns a 500 error with the message:
"Server configuration error: Missing Agent ID"

If `NEXT_PUBLIC_ULTRAVOX_API_KEY` is missing, the API returns a 500 error with the message:
"Server configuration error: Missing Ultravox API key"

## Related Files:

- `app/api/ultravox-call/route.ts` - Main API route that uses agent IDs
- `app/dashboard/page.tsx` - Where users set their language preference
- `app/page.tsx` - Where calls are initiated and agent preference is passed
- `components/AuthModals.tsx` - Sets default "English" preference for new users
- `lib/admin.ts` - Admin utilities (unrelated to agents)
- `.env.local` - Where these environment variables are defined

## Configuration Example:

```env
# Required
NEXT_PUBLIC_ULTRAVOX_API_KEY=your_ultravox_api_key
NEXT_PUBLIC_AGENT_ID=your_default_english_agent_id

# Optional (for multi-language support)
NEXT_PUBLIC_SPANISH_AGENT_ID=your_spanish_agent_id
NEXT_PUBLIC_AUSSIE_AGENT_ID=your_aussie_agent_id
```

## Notes:

- All environment variables use the `NEXT_PUBLIC_` prefix to be accessible in both client and server code
- The API route runs server-side, so the actual API call is secure
- Agent selection happens server-side based on user preference passed from client
- Wallet balance is read client-side and passed to the API route for security
