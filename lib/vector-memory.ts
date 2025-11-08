import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Initialize OpenAI for embeddings (lazy initialization)
let openaiClient: OpenAI | null = null;

const getOpenAIClient = () => {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
};

// Initialize Pinecone
let pineconeClient: Pinecone | null = null;

const getPineconeClient = () => {
  if (!pineconeClient) {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error('PINECONE_API_KEY is not configured');
    }
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
  }
  return pineconeClient;
};

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'alexlistens-memories';
const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const openai = getOpenAIClient();
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Store memory with vector embedding
 */
export async function storeMemory(
  userId: string,
  callId: string,
  text: string,
  metadata?: {
    speaker?: string;
    timestamp?: Date;
    callId?: string;
  }
): Promise<void> {
  try {
    // Generate embedding
    const embedding = await generateEmbedding(text);

    // Get Pinecone index
    const pinecone = getPineconeClient();
    const index = pinecone.index(PINECONE_INDEX_NAME);

    // Create unique ID for the memory
    const memoryId = `${userId}_${callId}_${Date.now()}`;

    // Upsert to Pinecone
    await index.upsert([
      {
        id: memoryId,
        values: embedding,
        metadata: {
          userId,
          callId: metadata?.callId || callId,
          text: text.substring(0, 1000), // Store first 1000 chars as metadata
          speaker: metadata?.speaker || 'unknown',
          timestamp: metadata?.timestamp?.toISOString() || new Date().toISOString(),
        },
      },
    ]);

    // Store full metadata in Firestore (optional - via API route)
    // Firestore storage is handled separately to avoid server-side Firebase client SDK issues
    // Metadata is stored in Pinecone, and full text can be retrieved from there

    console.log('Memory stored successfully:', memoryId);
  } catch (error) {
    console.error('Error storing memory:', error);
    throw error;
  }
}

/**
 * Search for relevant memories using semantic search
 */
export async function searchMemories(
  userId: string,
  queryText: string,
  limit: number = 5
): Promise<Array<{
  text: string;
  speaker: string;
  callId: string;
  timestamp: Date;
  score: number;
}>> {
  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(queryText);

    // Get Pinecone index
    const pinecone = getPineconeClient();
    const index = pinecone.index(PINECONE_INDEX_NAME);

    // Search Pinecone
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true,
      filter: {
        userId: { $eq: userId },
      },
    });

    // Format results from Pinecone metadata
    // Full text is stored in Pinecone metadata (first 1000 chars) and in Firestore via API route
    const results = queryResponse.matches.map((match) => {
      const metadata = match.metadata || {};
      return {
        text: String(metadata.text || ''),
        speaker: String(metadata.speaker || 'unknown'),
        callId: String(metadata.callId || ''),
        timestamp: metadata.timestamp 
          ? new Date(String(metadata.timestamp))
          : new Date(),
        score: match.score || 0,
      };
    });

    return results;
  } catch (error) {
    console.error('Error searching memories:', error);
    throw error;
  }
}

/**
 * Store conversation transcripts as memories
 */
export async function storeConversationMemory(
  userId: string,
  callId: string,
  transcripts: Array<{ speaker: string; text: string }>
): Promise<void> {
  try {
    // Store each transcript as a separate memory
    for (const transcript of transcripts) {
      if (transcript.text.trim()) {
        await storeMemory(userId, callId, transcript.text, {
          speaker: transcript.speaker,
          callId,
          timestamp: new Date(),
        });
      }
    }

    // Also store the full conversation as context
    const fullConversation = transcripts
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');

    if (fullConversation.trim()) {
      await storeMemory(userId, callId, fullConversation, {
        speaker: 'conversation',
        callId,
        timestamp: new Date(),
      });
    }
  } catch (error) {
    console.error('Error storing conversation memory:', error);
    // Don't throw - allow call to continue even if memory storage fails
  }
}

/**
 * Get relevant context for a new conversation
 */
export async function getRelevantContext(
  userId: string,
  queryText: string,
  maxMemories: number = 3
): Promise<string> {
  try {
    const memories = await searchMemories(userId, queryText, maxMemories);
    
    if (memories.length === 0) {
      return 'No previous conversation history. This is the first call.';
    }

    // Format memories as context
    const context = memories
      .map((m, idx) => `Previous conversation ${idx + 1}:\n${m.speaker}: ${m.text}`)
      .join('\n\n');

    return context;
  } catch (error) {
    console.error('Error getting relevant context:', error);
    return 'No previous conversation history available.';
  }
}

/**
 * Initialize Pinecone index (call this once to set up the index)
 */
export async function initializePineconeIndex(): Promise<void> {
  try {
    const pinecone = getPineconeClient();
    
    // Check if index exists
    const indexes = await pinecone.listIndexes();
    const indexExists = indexes.indexes?.some(idx => idx.name === PINECONE_INDEX_NAME);

    if (!indexExists) {
      // Create index if it doesn't exist
      await pinecone.createIndex({
        name: PINECONE_INDEX_NAME,
        dimension: 1536, // text-embedding-3-small dimension
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });
      console.log('Pinecone index created:', PINECONE_INDEX_NAME);
    } else {
      console.log('Pinecone index already exists:', PINECONE_INDEX_NAME);
    }
  } catch (error) {
    console.error('Error initializing Pinecone index:', error);
    throw error;
  }
}

// Ensure Pinecone index is initialized once per runtime
let pineconeInitialized = false;
export async function ensurePineconeReady(): Promise<void> {
  if (pineconeInitialized) return;
  await initializePineconeIndex().catch((err) => {
    // Do not mark as initialized if init failed
    console.error('Pinecone init error:', err);
    throw err;
  });
  pineconeInitialized = true;
}

/**
 * Get user's Pinecone memory statistics
 */
export async function getUserMemoryStats(userId: string): Promise<{
  totalMemories: number;
  uniqueCallIds: number;
  oldestMemory?: Date;
  newestMemory?: Date;
}> {
  try {
    const pinecone = getPineconeClient();
    const index = pinecone.index(PINECONE_INDEX_NAME);

    // Query with a dummy vector to get all user memories
    // We'll use a zero vector and filter by userId
    const zeroVector = new Array(1536).fill(0);
    
    // Query with high topK to get all memories (Pinecone allows up to 10,000)
    const queryResponse = await index.query({
      vector: zeroVector,
      topK: 10000, // Maximum allowed
      includeMetadata: true,
      filter: {
        userId: { $eq: userId },
      },
    });

    const memories = queryResponse.matches || [];
    const callIds = new Set<string>();
    const timestamps: Date[] = [];

    memories.forEach((match) => {
      const metadata = match.metadata || {};
      const callId = String(metadata.callId || '');
      if (callId) callIds.add(callId);
      
      const timestamp = metadata.timestamp 
        ? new Date(String(metadata.timestamp))
        : null;
      if (timestamp && !isNaN(timestamp.getTime())) {
        timestamps.push(timestamp);
      }
    });

    return {
      totalMemories: memories.length,
      uniqueCallIds: callIds.size,
      oldestMemory: timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : undefined,
      newestMemory: timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : undefined,
    };
  } catch (error) {
    console.error('Error getting user memory stats:', error);
    throw error;
  }
}

/**
 * Delete all memories for a user from Pinecone
 */
export async function deleteUserMemories(userId: string): Promise<number> {
  try {
    const pinecone = getPineconeClient();
    const index = pinecone.index(PINECONE_INDEX_NAME);

    // Query to get all user memory IDs
    const zeroVector = new Array(1536).fill(0);
    const queryResponse = await index.query({
      vector: zeroVector,
      topK: 10000, // Maximum allowed
      includeMetadata: true,
      filter: {
        userId: { $eq: userId },
      },
    });

    const memoryIds = queryResponse.matches.map(match => match.id);
    
    if (memoryIds.length === 0) {
      return 0;
    }

    // Delete in batches (Pinecone allows up to 1000 IDs per delete)
    const batchSize = 1000;
    let deletedCount = 0;

    for (let i = 0; i < memoryIds.length; i += batchSize) {
      const batch = memoryIds.slice(i, i + batchSize);
      await index.deleteMany(batch);
      deletedCount += batch.length;
    }

    console.log(`Deleted ${deletedCount} memories for user ${userId}`);
    return deletedCount;
  } catch (error) {
    console.error('Error deleting user memories:', error);
    throw error;
  }
}

/**
 * List all user IDs that have memories in Pinecone
 */
export async function listUsersWithMemories(): Promise<string[]> {
  try {
    const pinecone = getPineconeClient();
    const index = pinecone.index(PINECONE_INDEX_NAME);

    // Query with zero vector to get all memories
    const zeroVector = new Array(1536).fill(0);
    const queryResponse = await index.query({
      vector: zeroVector,
      topK: 10000, // Maximum allowed
      includeMetadata: true,
    });

    const userIds = new Set<string>();
    queryResponse.matches.forEach((match) => {
      const metadata = match.metadata || {};
      const userId = String(metadata.userId || '');
      if (userId) userIds.add(userId);
    });

    return Array.from(userIds);
  } catch (error) {
    console.error('Error listing users with memories:', error);
    throw error;
  }
}

