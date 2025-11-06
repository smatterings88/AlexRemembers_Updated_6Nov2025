# Vercel Deployment Guide

This guide will help you deploy AlexListens to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Your GitHub repository connected to Vercel

## Deployment Steps

### 1. Connect Repository to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository: `smatterings88/AlexRemembers_Updated_6Nov2025`
4. Vercel will automatically detect Next.js

### 2. Configure Environment Variables

Add all required environment variables in Vercel project settings:

#### Firebase Configuration
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

#### Ultravox Configuration
```
NEXT_PUBLIC_ULTRAVOX_API_KEY=your_ultravox_api_key
NEXT_PUBLIC_AGENT_ID=your_default_agent_id
NEXT_PUBLIC_SPANISH_AGENT_ID=your_spanish_agent_id
NEXT_PUBLIC_AUSSIE_AGENT_ID=your_aussie_agent_id
```

#### Optional
```
NEXT_PUBLIC_OPENCAGE_API_KEY=your_opencage_api_key
NEXT_PUBLIC_APP_VERSION=1.0.0
```

#### Vector Memory (Pinecone + OpenAI)
```
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=alexlistens-memories
OPENAI_API_KEY=your_openai_api_key
```


### 3. Build Settings

Vercel will automatically detect:
- **Framework Preset**: Next.js
- **Build Command**: `npm run build` (from package.json)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install`

### 4. Deploy

1. Click "Deploy" button
2. Wait for build to complete
3. Your app will be live at: `https://your-project-name.vercel.app`

## Post-Deployment Checklist

### ✅ Firestore Rules
- [ ] Deploy updated Firestore rules to Firebase Console
- [ ] Verify admin emails are configured correctly

### ✅ Domain Configuration (Optional)
- [ ] Add custom domain in Vercel settings
- [ ] Update Firebase Auth authorized domains
- [ ] Configure DNS records

### ✅ Environment Variables
- [ ] Verify all environment variables are set in Vercel
- [ ] Test production build locally with production env vars

### ✅ Testing
- [ ] Test user authentication
- [ ] Test voice calls
- [ ] Test admin panel access
- [ ] Test wallet functionality

## Important Notes

1. **Environment Variables**: All `NEXT_PUBLIC_*` variables are exposed to the client. Never put secrets in these variables.

2. **Firestore Rules**: Must be deployed separately via Firebase Console or Firebase CLI:
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Build Verification**: The build completed successfully with:
   - Static pages: `/`, `/admin`, `/dashboard`
   - API route: `/api/ultravox-call` (dynamic)

4. **Region**: Default region is `iad1` (US East). Can be changed in `vercel.json` if needed.

## Troubleshooting

### Build Fails
- Check environment variables are set correctly
- Verify all dependencies are in `package.json`
- Check build logs in Vercel dashboard

### Runtime Errors
- Check browser console for client-side errors
- Check Vercel function logs for API route errors
- Verify Firebase config matches environment variables

### Admin Panel Not Accessible
- Verify Firestore rules are deployed
- Check admin emails match in both `lib/admin.ts` and `firestore.rules`

## Support

For deployment issues, check:
- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)

