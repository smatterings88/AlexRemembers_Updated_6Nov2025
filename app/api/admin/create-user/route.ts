import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Admin not configured' }, { status: 500 });
    }

    // Verify caller is authenticated and an admin (by email, matching firestore.rules convention)
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Missing Authorization token' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(token);
    const callerEmail = decoded.email || '';
    const allowedAdmins = ['mgzobel@icloud.com', 'kenergizer@mac.com'];
    if (!callerEmail || !allowedAdmins.includes(callerEmail)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { email, firstName, lastName, username } = body;
    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    // Check if username is already taken (if provided)
    if (username) {
      const usernameDoc = await adminDb.collection('usernames').doc(username).get();
      if (usernameDoc.exists()) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
      }
    }

    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password: tempPassword,
      emailVerified: false,
      displayName: username || [firstName, lastName].filter(Boolean).join(' ') || undefined,
      disabled: false,
    });

    const uid = userRecord.uid;

    // Initialize Firestore defaults
    const batch = adminDb.batch();

    const userRef = adminDb.collection('users').doc(uid);
    batch.set(userRef, {
      email,
      firstName: firstName || null,
      lastName: lastName || null,
      username: username || null,
      alexEthnicity: 'English',
      mustChangePassword: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    const walletRef = adminDb.collection('wallets').doc(uid);
    batch.set(walletRef, {
      // store seconds; 10 minutes = 600 seconds
      balance: 600,
      lastLoaded: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    const statsRef = adminDb.collection('callstats').doc(uid);
    batch.set(statsRef, {
      totalCalls: 0,
      lastCallAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    // Reserve username if provided
    if (username) {
      const usernameRef = adminDb.collection('usernames').doc(username);
      batch.set(usernameRef, {
        uid: uid,
        createdAt: new Date(),
      }, { merge: true });
    }

    await batch.commit();

    return NextResponse.json({ uid, email, tempPassword });
  } catch (error: any) {
    console.error('Create user (admin) error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}


