# Vector Memory Implementation

This document describes the vector memory system implementation using Pinecone and OpenAI.

## Architecture

The vector memory system provides semantic search capabilities for conversation history:

1. **Storage**: 
   - Vector embeddings stored in Pinecone
   - Full text and metadata stored in Firestore (`memories` collection)

2. **Embeddings**: 
   - Generated using OpenAI's `text-embedding-3-small` model (1536 dimensions)
   - Each conversation transcript is embedded individually
   - Full conversations are also embedded as context

3. **Search**:
   - Semantic similarity search using Pinecone
   - Filters by userId for privacy
   - Returns top-k most relevant memories

## Components

### `lib/vector-memory.ts`
Core service for vector memory operations:
- `storeMemory()` - Store individual memory with embedding
- `searchMemories()` - Search for relevant memories
- `storeConversationMemory()` - Store full conversation transcripts
- `getRelevantContext()` - Get formatted context for Ultravox
- `initializePineconeIndex()` - Setup Pinecone index (one-time)

### `app/api/vector-memory/route.ts`
API endpoint for vector memory operations:
- `POST /api/vector-memory` with `action: 'store'` - Store memories
- `POST /api/vector-memory` with `action: 'search'` - Search memories

### Integration Points

1. **Memory Storage** (`app/page.tsx`):
   - After each call, transcripts are stored via `/api/vector-memory`
   - Non-blocking - failures don't affect call functionality

2. **Context Retrieval** (`app/api/ultravox-call/route.ts`):
   - Before creating Ultravox call, retrieves relevant context
   - Uses semantic search based on user's name and conversation query
   - Falls back to last call transcript if vector search fails

## Setup

### 1. Pinecone Setup
1. Sign up at [https://www.pinecone.io/](https://www.pinecone.io/)
2. Create a new project
3. Get your API key from the dashboard
4. Add to `.env.local`: `PINECONE_API_KEY=your_key`
5. Optionally set index name: `PINECONE_INDEX_NAME=alexlistens-memories`

### 2. OpenAI Setup
1. Sign up at [https://platform.openai.com/](https://platform.openai.com/)
2. Get API key from API keys section
3. Add to `.env.local`: `OPENAI_API_KEY=your_key`

### 3. Index Creation
The Pinecone index is created automatically on first use if it doesn't exist:
- Name: `alexlistens-memories` (or custom via env var)
- Dimension: 1536 (text-embedding-3-small)
- Metric: cosine similarity
- Cloud: AWS (us-east-1)

## Data Flow

### Storing Memories
```
User Call → Transcripts → /api/vector-memory (store)
  → Generate embeddings (OpenAI)
  → Store vectors (Pinecone)
  → Store metadata (Firestore)
```

### Retrieving Context
```
New Call → /api/ultravox-call
  → Generate query embedding
  → Search Pinecone (filtered by userId)
  → Fetch full text from Firestore
  → Format as context
  → Pass to Ultravox
```

## Firestore Schema

### `memories/{memoryId}`
```typescript
{
  userId: string;
  callId: string;
  text: string;
  speaker: string;
  embeddingGenerated: boolean;
  createdAt: Timestamp;
  timestamp: Date;
}
```

## Security

- Vector memory operations are server-side only
- User data is filtered by userId in Pinecone queries
- Firestore rules ensure users can only access their own memories
- Admin users can access all memories via Firestore rules

## Performance Considerations

- Embeddings are generated asynchronously
- Vector storage failures don't block call functionality
- Search results are limited to top-k (default: 5)
- Full conversation context is also stored for quick fallback

## Error Handling

- Vector memory operations are non-blocking
- Failures are logged but don't affect user experience
- Falls back to Firestore-only storage if vector operations fail
- Graceful degradation ensures app continues to work

