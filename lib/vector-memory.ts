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

