# AlexListens - AI Voice Assistant

AlexListens is an advanced AI voice assistant that provides natural, empathetic conversations through real-time voice interaction. Built with Next.js, Firebase, and Ultravox, it offers a seamless conversational experience with smart memory capabilities.

## Features

- 🎙️ Real-time voice interaction
- 📝 Live conversation transcription
- 🧠 Vector-based semantic memory system
- 🔐 Secure user authentication
- 💬 Persistent conversation history
- 💰 Wallet-based call time management
- 🌍 Multi-language support (English, Spanish, Australian)
- 👥 Admin panel for user management

## Tech Stack

- **Frontend**: Next.js 15.1.0, React 19.0.0, TypeScript 5.6.3
- **Styling**: Tailwind CSS 3.4.17, PostCSS
- **UI Components**: Headless UI 2.1.0, Lucide React 0.460.0
- **Backend**: Firebase 11.1.0 (Auth + Firestore)
- **Voice AI**: Ultravox Client 0.3.6
- **Vector Memory**: Pinecone + OpenAI Embeddings
- **Location Services**: OpenCage Geocoding API (optional)

## Getting Started

1. Clone the repository
2. Create a `.env.local` file with required environment variables (see below)
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Environment Variables

The following environment variables are required. Copy them to a `.env.local` file in the root directory:

```env
# Firebase Client Configuration
# Get these from: https://console.firebase.google.com/
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Ultravox Configuration
# Get these from: https://ultravox.ai/
NEXT_PUBLIC_ULTRAVOX_API_KEY=your_ultravox_api_key
NEXT_PUBLIC_AGENT_ID=your_default_agent_id
NEXT_PUBLIC_SPANISH_AGENT_ID=your_spanish_agent_id
NEXT_PUBLIC_AUSSIE_AGENT_ID=your_aussie_agent_id

# OpenCage Geocoding API (Optional - for location services)
# Get from: https://opencagedata.com/
NEXT_PUBLIC_OPENCAGE_API_KEY=your_opencage_api_key

# Vector Memory Configuration (Pinecone + OpenAI)
# Get Pinecone API key from: https://www.pinecone.io/
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=alexlistens-memories  # Optional, defaults to 'alexlistens-memories'

# Get OpenAI API key from: https://platform.openai.com/
OPENAI_API_KEY=your_openai_api_key
```

## Architecture

This application uses a **client-side only** architecture for Firebase with server-side Ultravox integration:

- **Firebase Web SDK**: All Firebase operations run in the browser
- **Client-side wallet balance**: Wallet balance is read client-side and passed to API routes
- **Server-side Ultravox calls**: Ultravox API calls are made through Next.js API routes (`/api/ultravox-call`) for security
- **Firestore Security Rules**: Data access is controlled via Firestore security rules with admin support
- **No server-side Firebase**: No Firebase Admin SDK or server-side Firebase operations

## Key Features

### User Dashboard (`/dashboard`)
- View wallet balance
- Manage account preferences
- Set language/ethnicity preference
- Account overview

### Admin Panel (`/admin`)
- **Super Admin Access**: Only accessible to configured admin emails
- View all users and their statistics
- Manage user wallets (add minutes)
- System-wide statistics
- Search and filter users
- Access to all call data

### Wallet System
- New users receive 10 minutes (600 seconds) upon signup
- Call duration is deducted from wallet balance
- Wallet balance determines maximum call duration
- Low balance warnings

### Multi-Language Support
Users can select their preferred conversation language:
- **English** (default)
- **Spanish**
- **Australian English**

The system automatically uses the appropriate Ultravox agent based on user preference.

## Environment Variable Setup

### Firebase Configuration
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Navigate to Project Settings → General → Your apps
4. Copy the Firebase configuration values to your `.env.local` file

### Ultravox Configuration
1. Sign up for an Ultravox account at [https://ultravox.ai/](https://ultravox.ai/)
2. Create your AI agents:
   - Default English agent
   - Spanish agent (optional)
   - Australian English agent (optional)
3. Get your API key and agent IDs
4. Add them to your `.env.local` file with the `NEXT_PUBLIC_` prefix

### OpenCage Geocoding (Optional)
1. Sign up for a free OpenCage account at [https://opencagedata.com/](https://opencagedata.com/)
2. Get your API key
3. Add `NEXT_PUBLIC_OPENCAGE_API_KEY=your_key` to `.env.local`
4. If not configured, the app will gracefully fall back to "Location not available"

### Vector Memory Configuration (Pinecone + OpenAI)

The app uses Pinecone for vector storage and OpenAI for generating embeddings:

1. **Pinecone Setup**:
   - Sign up at [https://www.pinecone.io/](https://www.pinecone.io/)
   - Create a new index (or use default `alexlistens-memories`)
   - Get your API key from the dashboard
   - Add `PINECONE_API_KEY=your_key` to `.env.local`
   - Optionally set `PINECONE_INDEX_NAME=your_index_name` (defaults to `alexlistens-memories`)

2. **OpenAI Setup**:
   - Sign up at [https://platform.openai.com/](https://platform.openai.com/)
   - Get your API key from the API keys section
   - Add `OPENAI_API_KEY=your_key` to `.env.local`
   - Uses `text-embedding-3-small` model (1536 dimensions)

**Note**: The Pinecone index will be created automatically on first use if it doesn't exist. Make sure your Pinecone account has sufficient credits.

## Admin Configuration

Super admin emails are configured in:
- `lib/admin.ts` - Client-side admin check
- `firestore.rules` - Firestore security rules

To add or modify admin emails, update both files.

## Development

### Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server

### Project Structure
```
├── app/
│   ├── admin/          # Admin panel
│   ├── api/            # API routes
│   ├── dashboard/      # User dashboard
│   └── page.tsx        # Home page
├── components/         # React components
├── lib/                # Utility functions
│   ├── admin.ts        # Admin utilities
│   ├── firebase.ts     # Firebase config
│   ├── vector-memory.ts # Vector memory service (Pinecone + OpenAI)
│   └── wallet.ts       # Wallet functions
└── firestore.rules     # Firestore security rules
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@alexlistens.com
