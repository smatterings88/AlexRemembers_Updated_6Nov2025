import { NextRequest, NextResponse } from 'next/server';
import { getRelevantContext, storeConversationMemory, ensurePineconeReady } from '@/lib/vector-memory';

export async function POST(request: NextRequest) {
  try {
    // Ensure Pinecone index exists (runs once per runtime)
    await ensurePineconeReady();

    const body = await request.json();
    const { userId, queryText, action, callId, transcripts } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (action === 'search') {
      // Get relevant context using semantic search
      if (!queryText) {
        return NextResponse.json(
          { error: 'queryText is required for search action' },
          { status: 400 }
        );
      }

      const context = await getRelevantContext(userId, queryText, 3);
      return NextResponse.json({ context });
    }

    if (action === 'store') {
      // Store conversation memory
      if (!callId || !transcripts) {
        return NextResponse.json(
          { error: 'callId and transcripts are required for store action' },
          { status: 400 }
        );
      }

      await storeConversationMemory(userId, callId, transcripts);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "search" or "store"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Vector memory API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
