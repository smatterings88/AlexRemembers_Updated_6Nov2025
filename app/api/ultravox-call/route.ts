import { NextRequest, NextResponse } from 'next/server';
import { getRelevantContext, ensurePineconeReady } from '@/lib/vector-memory';

export async function POST(request: NextRequest) {
  try {
    // Check for required environment variables
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

    // Ensure Pinecone is ready (index exists) before any vector operations
    await ensurePineconeReady().catch(() => {
      // Continue without vector search if initialization fails
    });

    // Get request body
    const body = await request.json();
    const { firstName, lastCallTranscript, currentTime, userLocation, totalCalls, alexEthnicity, walletBalance, userId, conversationQuery } = body;

    // Use vector memory to get relevant context if available
    let relevantContext = lastCallTranscript || 'No previous call. This is the first call';
    
    if (userId && conversationQuery) {
      try {
        const vectorContext = await getRelevantContext(userId, conversationQuery, 3);
        if (vectorContext && vectorContext !== 'No previous conversation history available.') {
          relevantContext = vectorContext;
        }
      } catch (error) {
        console.error('Error getting vector context, falling back to lastCallTranscript:', error);
        // Fallback to lastCallTranscript if vector search fails
      }
    }

    // Use wallet balance passed from client for maxDuration
    let maxDurationSeconds = 3600; // Default 1 hour
    if (walletBalance && walletBalance > 0) {
      // Set maxDuration to the user's balance (in seconds)
      // Add a small buffer (30 seconds) to account for connection time
      maxDurationSeconds = Math.max(walletBalance + 30, 60); // Minimum 1 minute
      
      console.log('📊 Using wallet balance for maxDuration:', {
        walletBalance,
        maxDurationSeconds
      });
    }

    // Determine which agent to use based on user's alexEthnicity preference
    let agentId = process.env.NEXT_PUBLIC_AGENT_ID; // Default English agent

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

    const apiUrl = `https://api.ultravox.ai/api/agents/${agentId}/calls`;

    console.log('🚀 Calling Ultravox API:', {
      url: apiUrl,
      hasApiKey: !!process.env.NEXT_PUBLIC_ULTRAVOX_API_KEY,
      firstName,
      userLocation,
      totalCalls,
      maxDurationSeconds,
      agentType: agentId === process.env.NEXT_PUBLIC_SPANISH_AGENT_ID ? 'Spanish' : 
                 agentId === process.env.NEXT_PUBLIC_AUSSIE_AGENT_ID ? 'Aussie' : 'English'
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.NEXT_PUBLIC_ULTRAVOX_API_KEY,
      },
      body: JSON.stringify({
        templateContext: {
          userFirstname: firstName || 'User',
          lastCallTranscript: relevantContext,
          currentTime: currentTime || new Date().toLocaleTimeString(),
          userLocation: userLocation || 'Unknown Location',
          userTotalCalls: totalCalls?.toString() || '0'
        },
        initialMessages: [],
        metadata: {},
        medium: {
          webRtc: {}
        },
        joinTimeout: "300s",
        maxDuration: `${maxDurationSeconds}s`, // Use wallet balance as maxDuration
        recordingEnabled: false,
        initialOutputMedium: "MESSAGE_MEDIUM_VOICE",
        firstSpeakerSettings: {
          agent: {}
        },
        experimentalSettings: {}
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ultravox API error:', {
        status: response.status,
        error: errorText,
        agentId: agentId?.substring(0, 8) + '...'
      });
      return NextResponse.json(
        { error: `Failed to create call: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Ultravox API success:', {
      joinUrl: data.joinUrl,
      maxDurationSeconds,
      agentType: agentId === process.env.NEXT_PUBLIC_SPANISH_AGENT_ID ? 'Spanish' : 
                 agentId === process.env.NEXT_PUBLIC_AUSSIE_AGENT_ID ? 'Aussie' : 'English'
    });
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}