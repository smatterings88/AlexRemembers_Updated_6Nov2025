import admin from 'firebase-admin';

// Initialize Firebase Admin SDK once per runtime
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Private key may contain escaped newlines when set in env vars
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('Firebase Admin not fully configured; admin features may not work.');
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
}

export const adminAuth = admin.apps.length ? admin.auth() : null;
export const adminDb = admin.apps.length ? admin.firestore() : null;


