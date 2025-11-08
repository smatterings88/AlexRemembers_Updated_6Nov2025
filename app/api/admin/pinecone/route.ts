import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { isAdmin } from '@/lib/admin';
import { getUserMemoryStats, deleteUserMemories, listUsersWithMemories, ensurePineconeReady } from '@/lib/vector-memory';

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth?.verifyIdToken(token);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!decodedToken || !isAdmin(decodedToken)) {
      return NextResponse.json({ error: 'Forbidden: Not an admin' }, { status: 403 });
    }

    await ensurePineconeReady();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');

    if (action === 'list-users') {
      // List all users with memories
      const userIds = await listUsersWithMemories();
      return NextResponse.json({ userIds });
    }

    if (userId && action === 'stats') {
      // Get user's memory statistics
      const stats = await getUserMemoryStats(userId);
      return NextResponse.json({ stats });
    }

    return NextResponse.json({ error: 'Invalid action or missing userId' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in Pinecone admin API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify admin authentication
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth?.verifyIdToken(token);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!decodedToken || !isAdmin(decodedToken)) {
      return NextResponse.json({ error: 'Forbidden: Not an admin' }, { status: 403 });
    }

    await ensurePineconeReady();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Delete all memories for the user
    const deletedCount = await deleteUserMemories(userId);
    return NextResponse.json({ 
      success: true, 
      deletedCount,
      message: `Successfully deleted ${deletedCount} memories for user ${userId}`
    });
  } catch (error: any) {
    console.error('Error deleting user memories:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

