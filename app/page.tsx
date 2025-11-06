'use client';

import React, { useEffect, useState, useRef } from 'react';
import { UltravoxSession } from 'ultravox-client';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, collection, query, where, orderBy, limit, getDocs, increment, addDoc } from 'firebase/firestore';
import { initWalletForUser, logCall, getWalletBalance, hasInsufficientBalance } from '../lib/wallet';
import AuthModals from '../components/AuthModals';
import UserDropdown from '../components/UserDropdown';
import { Mic, MicOff, Radio, PhoneOff } from 'lucide-react';

export default function HomePage() {
  const [session, setSession] = useState<UltravoxSession | null>(null);
  const [transcripts, setTranscripts] = useState<Array<{ speaker: string; text: string }>>([]);
  const [status, setStatus] = useState<string>('disconnected');
  const [isStarted, setIsStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranscripts, setShowTranscripts] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isSignUpOpen, setIsSignUpOpen] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isCallActive, setIsCallActive] = useState(false);
  const [userLocation, setUserLocation] = useState<string>('Unknown Location');
  const [callButtonKey, setCallButtonKey] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const currentTranscriptsRef = useRef<Array<{ speaker: string; text: string }>>([]);
  const callIdRef = useRef<string>('');
  const userFirstNameRef = useRef<string>('');
  const userLatestCallRef = useRef<string>('');
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const walletLoggedRef = useRef<boolean>(false);
  const previousStatusRef = useRef<string>('disconnected');
  const lastActiveStatusRef = useRef<string | null>(null);

  const refreshUserStats = async () => {
    if (user) {
      const balance = await getWalletBalance(user.uid);
      setWalletBalance(balance);
      setLogsRefreshKey(prev => prev + 1);
    }
  };

  const resetCallState = () => {
    setIsStarted(false);
    setSession(null);
    setTranscripts([]);
    setStatus('disconnected');
    setError(null);
    setShowTranscripts(true);
    setIsCallActive(false);
    setCallButtonKey(prev => prev + 1);
    setCallStartTime(null);
    callStartTimeRef.current = null;
    currentTranscriptsRef.current = [];
    callIdRef.current = '';
    walletLoggedRef.current = false;
    previousStatusRef.current = 'disconnected';
    lastActiveStatusRef.current = null;
  };

  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    endCall();
    resetCallState();
  };

  const handleEndCall = () => {
    endCall();
    setTimeout(() => {
      resetCallState();
    }, 100);
  };

  const logCallToWallet = async (reason: string) => {
    if (walletLoggedRef.current) {
      return;
    }
    
    const hasRequiredData = user && callStartTimeRef.current !== null;
    
    if (hasRequiredData) {
      const endTime = Date.now();
      const callDuration = Math.floor((endTime - callStartTimeRef.current!) / 1000);
      
      if (callDuration > 0) {
        try {
          await logCall(user.uid, callDuration);
          walletLoggedRef.current = true;
          
          const newBalance = await getWalletBalance(user.uid);
          setWalletBalance(newBalance);
          setLogsRefreshKey(prev => prev + 1);
        } catch (error) {
          console.error('Error logging call to wallet:', error);
        }
      }
    }
  };

  // Improved location detection with better error handling
  useEffect(() => {
    const getLocationWithFallback = async () => {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        console.warn('Geolocation is not supported by this browser');
        setUserLocation('Location not available');
        return;
      }

      // Check for API key first
      const apiKey = process.env.NEXT_PUBLIC_OPENCAGE_API_KEY;
      if (!apiKey || apiKey === 'YOUR_API_KEY') {
        console.warn('OpenCage API key not configured, skipping location detection');
        setUserLocation('Location not available');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const response = await fetch(
              `https://api.opencagedata.com/geocode/v1/json?q=${position.coords.latitude}+${position.coords.longitude}&key=${apiKey}`,
              {
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                },
              }
            );
            
            if (!response.ok) {
              console.warn(`OpenCage API returned ${response.status}: ${response.statusText}`);
              setUserLocation('Location not available');
              return;
            }

            const data = await response.json();
            if (data.results && data.results[0]) {
              const city = data.results[0].components.city || data.results[0].components.town || 'Unknown City';
              const country = data.results[0].components.country || 'Unknown Country';
              setUserLocation(`${city}, ${country}`);
            } else {
              setUserLocation('Location not available');
            }
          } catch (error) {
            console.warn('Error getting location details:', error);
            setUserLocation('Location not available');
          }
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
          setUserLocation('Location not available');
        },
        {
          timeout: 10000, // 10 second timeout
          enableHighAccuracy: false, // Don't require high accuracy for city-level location
          maximumAge: 300000 // Accept cached position up to 5 minutes old
        }
      );
    };

    getLocationWithFallback();
  }, []);

  const incrementCallCount = async (userId: string) => {
    try {
      const statsRef = doc(db, 'callstats', userId);
      const statsDoc = await getDoc(statsRef);
      
      if (!statsDoc.exists()) {
        await setDoc(statsRef, {
          totalCalls: 1,
          lastCallAt: serverTimestamp()
        });
      } else {
        await setDoc(statsRef, {
          totalCalls: increment(1),
          lastCallAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error updating call count:', error);
    }
  };

  const getLatestCallTranscripts = async (userId: string) => {
    try {
      const callsRef = collection(db, 'callmemory');
      const q = query(
        callsRef,
        where('userId', '==', userId),
        orderBy('created_at', 'desc'),
        limit(1)
      );

      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const latestCall = querySnapshot.docs[0].data();
        const transcriptsText = latestCall.transcripts
          .map((t: { speaker: string; text: string }) => `${t.speaker}: ${t.text}`)
          .join('\n');
        userLatestCallRef.current = transcriptsText;
        return transcriptsText;
      }
      return '';
    } catch (error) {
      console.error('Error fetching latest call transcripts:', error);
      return '';
    }
  };

  const saveCallMemory = async (transcriptData: Array<{ speaker: string; text: string }>) => {
    if (!user || !callIdRef.current) {
      return;
    }

    try {
      // Store in Firestore (for backward compatibility and admin access)
      const callMemoryData = {
        userId: user.uid,
        callId: callIdRef.current,
        transcripts: transcriptData,
        lastUpdated: serverTimestamp(),
        created_at: serverTimestamp()
      };

      const docRef = doc(db, 'callmemory', callIdRef.current);
      await setDoc(docRef, callMemoryData, { merge: true });

      // Store in vector memory for semantic search (via API route)
      try {
        await fetch('/api/vector-memory', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.uid,
            callId: callIdRef.current,
            transcripts: transcriptData,
            action: 'store',
          }),
        }).catch(err => {
          console.error('Failed to store in vector memory (non-critical):', err);
        });
      } catch (vectorError) {
        console.error('Failed to store in vector memory (non-critical):', vectorError);
        // Don't throw - allow Firestore storage to succeed even if vector storage fails
      }
    } catch (error) {
      console.error('Failed to save call memory:', error);
    }
  };

  const ensureAlexEthnicityField = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (!userData.alexEthnicity) {
          // Add the alexEthnicity field with default value
          await setDoc(userRef, {
            alexEthnicity: 'English'
          }, { merge: true });
          console.log('Added alexEthnicity field to existing user:', userId);
        }
      }
    } catch (error) {
      console.error('Error ensuring alexEthnicity field:', error);
    }
  };

  const createUltravoxCall = async (firstName: string, lastCallTranscript: string, currentTime: string, userLocation: string, totalCalls: number, userId?: string) => {
    // Get user's alexEthnicity preference
    let alexEthnicity = 'English'; // Default
    
    if (userId) {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          alexEthnicity = userData?.alexEthnicity || 'English';
        }
      } catch (error) {
        console.error('Error fetching user ethnicity preference:', error);
      }
    }

    // Get current wallet balance from client-side
    let currentWalletBalance = 0;
    if (userId) {
      try {
        currentWalletBalance = await getWalletBalance(userId);
      } catch (error) {
        console.error('Error fetching wallet balance:', error);
      }
    }

    console.log('🎯 Selected agent based on ethnicity:', {
      userId,
      alexEthnicity,
      walletBalance: currentWalletBalance
    });

    // Create a query for vector search based on user's name and context
    // This helps retrieve semantically relevant memories
    const conversationQuery = firstName 
      ? `Conversation with ${firstName} about their life and experiences`
      : 'Previous conversations and context';

    // Call our local API route instead of Ultravox directly
    const response = await fetch('/api/ultravox-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: firstName || 'User',
        lastCallTranscript: lastCallTranscript || 'No previous call. This is the first call',
        currentTime: currentTime || new Date().toLocaleTimeString(),
        userLocation: userLocation || 'Unknown Location',
        totalCalls: totalCalls || 0,
        alexEthnicity: alexEthnicity,
        walletBalance: currentWalletBalance, // Pass wallet balance from client
        userId: userId, // Pass userId for vector memory lookup
        conversationQuery: conversationQuery // Query for semantic search
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to create call: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Ultravox API success:', {
      joinUrl: data.joinUrl
    });
    
    return data;
  };

  const startCall = async () => {
    try {
      if (user) {
        const insufficientBalance = await hasInsufficientBalance(user.uid, 30);
        if (insufficientBalance) {
          setError('Insufficient balance. Please add more time to your wallet before starting a call.');
          return;
        }
      }

      setStatus('connecting');
      const startTime = Date.now();
      setCallStartTime(startTime);
      callStartTimeRef.current = startTime;
      walletLoggedRef.current = false;
      previousStatusRef.current = 'connecting';
      lastActiveStatusRef.current = null;
      
      let totalCalls = 0;
      if (user) {
        await incrementCallCount(user.uid);
        // Get the updated totalCalls after incrementing
        const statsRef = doc(db, 'callstats', user.uid);
        const statsDoc = await getDoc(statsRef);
        if (statsDoc.exists()) {
          totalCalls = statsDoc.data().totalCalls || 0;
        }
      }

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }

      connectionTimeoutRef.current = setTimeout(() => {
        if (status === 'connecting') {
          setError('Connection timeout. Please try again.');
          setStatus('disconnected');
          endCall();
        }
      }, 15000);

      const data = await createUltravoxCall(
        userFirstNameRef.current,
        userLatestCallRef.current,
        new Date().toLocaleTimeString(),
        userLocation,
        totalCalls,
        user?.uid
      );

      const uvSession = new UltravoxSession();
      
      const urlParams = new URL(data.joinUrl).searchParams;
      const callId = urlParams.get('call_id') || `call_${Date.now()}`;
      callIdRef.current = callId;

      uvSession.addEventListener('status', () => {
        const newStatus = uvSession.status;
        const prevStatus = previousStatusRef.current;
        
        // Track active statuses (idle means connected but not yet active)
        if (['idle', 'speaking', 'listening', 'thinking'].includes(newStatus)) {
          lastActiveStatusRef.current = newStatus;
        }
        
        if (lastActiveStatusRef.current && newStatus === 'disconnected') {
          logCallToWallet('CALL_ENDED_NATURALLY');
        }
        
        setStatus(newStatus);
        previousStatusRef.current = newStatus;
        
        if (newStatus === 'idle' && connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
      });

      uvSession.addEventListener('error', (error) => {
        console.error('Ultravox session error:', error);
        setError(`Connection error: ${error?.message || 'Unknown error'}`);
        logCallToWallet('SESSION_ERROR');
        endCall();
      });

      uvSession.addEventListener('transcripts', () => {
        try {
          if (!uvSession.transcripts || !Array.isArray(uvSession.transcripts)) {
            return;
          }

          // Log transcripts for debugging
          console.log('📝 Ultravox transcripts:', uvSession.transcripts);

          // Process transcripts - Ultravox provides full conversation history
          const newTexts = uvSession.transcripts
            .filter(t => t && typeof t === 'object' && t.text && t.text.trim())
            .map(t => {
              // Normalize speaker value
              let speaker = 'unknown';
              const speakerValue = t.speaker as string | 'user' | 'agent' | undefined;
              
              if (speakerValue === 'user' || speakerValue === 'agent') {
                speaker = speakerValue;
              } else if (speakerValue && typeof speakerValue === 'string') {
                const speakerLower = speakerValue.toLowerCase();
                if (speakerLower.includes('user')) {
                  speaker = 'user';
                } else if (speakerLower.includes('agent') || speakerLower.includes('assistant')) {
                  speaker = 'agent';
                } else {
                  speaker = speakerValue;
                }
              }
              
              return {
                speaker,
                text: String(t.text || '').trim()
              };
            })
            .filter(t => t.text.length > 0);
          
          // Log processed transcripts with speaker breakdown
          const userCount = newTexts.filter(t => t.speaker === 'user').length;
          const agentCount = newTexts.filter(t => t.speaker === 'agent').length;
          console.log(`✅ Processed transcripts: ${newTexts.length} total (${userCount} user, ${agentCount} agent)`, newTexts);
          
          // Update transcripts - Ultravox provides full history, so we replace
          setTranscripts(newTexts);
          currentTranscriptsRef.current = newTexts;

          if (newTexts.length > 0) {
            saveCallMemory(newTexts).catch(err => {
              console.error('Error saving transcripts:', err);
            });
          }
        } catch (err) {
          console.error('Error processing transcripts:', err);
        }
      });

      uvSession.addEventListener('end', async () => {
        await logCallToWallet('SESSION_END_EVENT');
        await handleCallCleanup();
      });

      const handleCallCleanup = async () => {
        if (currentTranscriptsRef.current.length > 0 && user) {
          await saveCallMemory(currentTranscriptsRef.current);
        }
        
        setTimeout(() => {
          resetCallState();
        }, 500);
      };

      // Include client version for tracking (optional but recommended)
      const clientVersion = `alexlistens-web-${process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'}`;
      uvSession.joinCall(data.joinUrl, clientVersion);
      setSession(uvSession);
      setIsCallActive(true);
    } catch (err) {
      console.error('Error in startCall:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize session');
      setStatus('disconnected');
      setCallStartTime(null);
      callStartTimeRef.current = null;
      
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    }
  };

  const endCall = async () => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    if (session) {
      try {
        // Check if call is active before logging
        if (['idle', 'speaking', 'listening', 'thinking'].includes(session.status)) {
          await logCallToWallet('MANUAL_END_CALL');
        }
        
        // Leave call and wait for it to complete (leaveCall returns a Promise)
        if (['idle', 'speaking', 'listening', 'thinking', 'connecting'].includes(session.status)) {
          await session.leaveCall();
        }
        setSession(null);
        setIsCallActive(false);
        setStatus('disconnected');
      } catch (error) {
        console.error('Error ending call:', error);
        setSession(null);
        setIsCallActive(false);
        setStatus('disconnected');
      }
    }
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current && showTranscripts) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  const scrollToFooter = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById('footer')?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    setIsAuthLoading(true);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        await initWalletForUser(currentUser.uid);
        
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          userFirstNameRef.current = userData.firstName;
          await getLatestCallTranscripts(currentUser.uid);
        }
        
        // Ensure alexEthnicity field exists for existing users
        await ensureAlexEthnicityField(currentUser.uid);
        
        const balance = await getWalletBalance(currentUser.uid);
        setWalletBalance(balance);
      }
      
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (showTranscripts) {
      scrollToBottom();
    }
  }, [transcripts, showTranscripts]);

  useEffect(() => {
    if (!isStarted) return;
    startCall();
  }, [isStarted]);

  useEffect(() => {
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      endCall();
    };
  }, []);

  const startConversation = () => {
    if (!user) {
      setIsSignInOpen(true);
      return;
    }
    setError(null);
    setIsStarted(true);
  };

  const toggleTranscripts = () => {
    setShowTranscripts(!showTranscripts);
  };

  const getLastSpeaker = () => {
    if (transcripts.length === 0) return null;
    return transcripts[transcripts.length - 1].speaker;
  };

  const getMicrophoneState = () => {
    if (status === 'speaking') return 'speaking';
    if (status === 'listening') return 'listening';
    return 'ready';
  };

  const getStatusText = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting to Alex...';
      case 'idle':
        return 'Connected with Alex';
      case 'thinking':
        return 'Alex is thinking...';
      case 'speaking':
        return 'Alex is speaking...';
      case 'listening':
        return 'Alex is listening...';
      case 'disconnecting':
        return 'Ending call...';
      case 'disconnected':
        return 'Ready to chat';
      default:
        return 'Ready to chat';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'connecting':
        return <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 animate-pulse" />;
      case 'idle':
        return <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />;
      case 'thinking':
        return <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 animate-pulse" />;
      case 'speaking':
        return <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 animate-pulse" />;
      case 'listening':
        return <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 animate-pulse" />;
      case 'disconnecting':
        return <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 animate-pulse" />;
      case 'disconnected':
      default:
        return <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />;
    }
  };

  const renderCallControl = () => {
    return (
      <div className="glass px-3 sm:px-4 py-2 rounded-lg flex items-center gap-2 sm:gap-3 transition-all duration-300 hover:bg-white/15">
        <div className="w-5 sm:w-6 flex justify-center">
          {getStatusIcon()}
        </div>
        <span className={`text-xs sm:text-sm font-medium ${
          status === 'connecting' ? 'text-yellow-300' :
          status === 'idle' ? 'text-blue-300' :
          status === 'thinking' ? 'text-purple-300' :
          status === 'speaking' ? 'text-blue-300' :
          status === 'listening' ? 'text-green-300' :
          status === 'disconnecting' ? 'text-orange-300' :
          'text-white/70'
        }`}>
          {getStatusText()}
        </span>
      </div>
    );
  };

  const renderMicrophone = () => {
    const micState = getMicrophoneState();
    
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 animate-fade-in">
        <div className={`microphone-glow ${micState} animate-float`}>
          <img 
            src="https://storage.googleapis.com/msgsndr/JBLl8rdfV29DRcGjQ7Rl/media/67f65c4ecafd9f8d70fe2309.png"
            alt="Microphone"
            className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24"
          />
        </div>
        <p className="mt-4 sm:mt-6 text-white text-base sm:text-lg md:text-xl font-semibold text-center px-2 animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
          {getStatusText()}
        </p>
      </div>
    );
  };

  const renderCallButtons = () => {
    if (!isStarted) {
      return (
        <button
          key={`start-${callButtonKey}`}
          onClick={startConversation}
          className="btn-glass text-white px-8 sm:px-12 py-3 sm:py-4 md:py-5 rounded-full text-base sm:text-lg md:text-xl font-semibold shadow-lg animate-glow"
        >
          Start Talking Now
        </button>
      );
    }

    return (
      <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
        <button
          key={`toggle-${callButtonKey}`}
          onClick={toggleTranscripts}
          className="btn-glass text-white text-xs sm:text-sm px-4 sm:px-5 py-2.5 sm:py-3 rounded-full flex-1 sm:flex-none"
        >
          {showTranscripts ? 'Show Mic' : 'Show Chat'}
        </button>
        <button
          key={`end-${callButtonKey}`}
          onClick={handleEndCall}
          className="btn-glass bg-red-500/30 border-red-400/50 text-white hover:bg-red-500/40 text-xs sm:text-sm px-4 sm:px-5 py-2.5 sm:py-3 rounded-full flex items-center gap-1.5 sm:gap-2 flex-1 sm:flex-none justify-center"
        >
          <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          End Call
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass-dark sticky top-0 z-50 animate-slide-in-down">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <a href="/" className="hover:opacity-80 transition-all duration-300 hover:scale-105 flex-shrink-0">
              <img 
                src="https://storage.googleapis.com/msgsndr/JBLl8rdfV29DRcGjQ7Rl/media/67f5c2c30a6217bf61d1eb90.png" 
                alt="VoiceAI Logo" 
                className="h-8 sm:h-12 logo-white"
              />
            </a>
            <div className="flex gap-2 sm:gap-4 lg:gap-8 items-center text-sm sm:text-base">
              {isStarted && (
                <a 
                  href="#" 
                  onClick={handleHomeClick} 
                  className="text-white/90 hover:text-white transition-all duration-200 hover:scale-105 hidden sm:inline-block"
                >
                  Home
                </a>
              )}
              {!isStarted && (
                <a 
                  href="https://alexlistens.com/pricing" 
                  className="text-white/90 hover:text-white transition-all duration-200 hover:scale-105 hidden sm:inline-block"
                >
                  Pricing
                </a>
              )}
              <a 
                href="#footer" 
                onClick={scrollToFooter} 
                className="text-white/90 hover:text-white transition-all duration-200 hover:scale-105 hidden sm:inline-block"
              >
                Contact
              </a>
              {isAuthLoading ? (
                <div className="w-16 sm:w-24 h-6 sm:h-8 glass rounded-md animate-pulse"></div>
              ) : user ? (
                <UserDropdown user={user} onRefresh={refreshUserStats} />
              ) : (
                <button
                  onClick={() => setIsSignInOpen(true)}
                  className="btn-glass text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-sm sm:text-base font-medium"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </nav>
      </header>

      {!isStarted ? (
        <>
          <section className="relative py-12 sm:py-16 md:py-20 px-4 min-h-[60vh] sm:min-h-[70vh] flex items-center bg-cover bg-center z-0" style={{ backgroundImage: 'url(https://storage.googleapis.com/msgsndr/JBLl8rdfV29DRcGjQ7Rl/media/67f908e54ffcd142dd8158d6.png)' }}>
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/50"></div>
            <div className="max-w-7xl mx-auto text-center relative z-10 w-full animate-slide-in-up">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-4 sm:mb-6 md:mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200 leading-tight animate-scale-in">
                AlexListens
              </h1>
              <p className="text-base sm:text-lg md:text-xl lg:text-2xl mb-6 sm:mb-8 md:mb-12 text-white/90 max-w-3xl mx-auto px-4 leading-relaxed">
                Sometimes you just need someone who understands you. Someone who's there whenever you need them. Someone who lets you be yourself without criticism. That's Alex.
              </p>
              <div className="animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
                {renderCallButtons()}
              </div>
            </div>
          </section>

          <section id="features" className="py-12 sm:py-16 md:py-20 px-4">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-white mb-8 sm:mb-12 md:mb-16 animate-slide-in-up">Key Features</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8 lg:gap-12">
                <div className="card-glass p-6 sm:p-8 text-white animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
                  <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4">Real-time Voice</h3>
                  <p className="text-white/80 text-sm sm:text-base">Natural conversations with instant voice responses, just like talking to a friend</p>
                </div>
                <div className="card-glass p-6 sm:p-8 text-white animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
                  <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4">Live Transcription</h3>
                  <p className="text-white/80 text-sm sm:text-base">Watch your conversation unfold with real-time text transcription</p>
                </div>
                <div className="card-glass p-6 sm:p-8 text-white animate-slide-in-up" style={{ animationDelay: '0.3s' }}>
                  <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4">Smart Memory</h3>
                  <p className="text-white/80 text-sm sm:text-base">Context-aware AI that remembers your conversations for more meaningful interactions</p>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="flex-1 px-3 sm:px-4 py-4 sm:py-6 md:py-8 overflow-hidden">
          <div className="card-glass p-4 sm:p-6 md:p-8 w-full max-w-2xl mx-auto flex flex-col text-white animate-scale-in" style={{ height: 'calc(100vh - 120px)', minHeight: '500px' }}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Voice Chat</h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                {renderCallControl()}
                {renderCallButtons()}
              </div>
            </div>
            
            {error && (
              <div className="glass-dark bg-red-500/20 border-red-500/50 text-red-100 p-3 sm:p-4 rounded-lg mb-3 sm:mb-4 text-sm sm:text-base animate-slide-in-down">
                {error}
              </div>
            )}
            
            <div 
              ref={chatContainerRef}
              className={`flex-1 ${showTranscripts ? 'overflow-y-auto pr-2 sm:pr-4 -mr-2 sm:-mr-4' : 'overflow-hidden'}`}
            >
              {showTranscripts ? (
                <div className="space-y-3 sm:space-y-4 min-h-full">
                  {transcripts.length === 0 ? (
                    <div className="text-white/60 text-center py-12 animate-fade-in">
                      <p className="text-sm sm:text-base">Conversation will appear here...</p>
                    </div>
                  ) : (
                    transcripts.map((transcript, index) => {
                      const isUser = transcript.speaker === 'user' || transcript.speaker.toLowerCase() === 'user';
                      return (
                        <div 
                          key={`${transcript.speaker}-${index}-${transcript.text.substring(0, 10)}`}
                          className={`glass p-3 sm:p-4 rounded-xl max-w-[85%] sm:max-w-[80%] text-sm sm:text-base transition-all duration-300 hover:scale-[1.02] animate-slide-in-up ${
                            isUser
                              ? 'ml-auto bg-blue-500/30 border-blue-400/50' 
                              : 'mr-auto bg-purple-500/30 border-purple-400/50'
                          }`}
                          style={{ animationDelay: `${index * 0.05}s` }}
                        >
                          <div className="font-semibold text-xs mb-1.5 opacity-90">
                            {isUser ? 'You' : 'Alex'}
                          </div>
                          <div className="text-white/95 leading-relaxed">{transcript.text}</div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                renderMicrophone()
              )}
            </div>
          </div>
        </div>
      )}

      <footer id="footer" className="glass-dark py-8 sm:py-12 px-4 mt-auto">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 md:gap-12">
            <div className="animate-slide-in-up">
              <img 
                src="https://storage.googleapis.com/msgsndr/JBLl8rdfV29DRcGjQ7Rl/media/67f5c2c30a6217bf61d1eb90.png" 
                alt="VoiceAI Logo" 
                className="h-8 sm:h-12 mb-3 sm:mb-4 logo-white"
              />
              <p className="text-white/80 text-sm sm:text-base">Sometimes you just need someone to talk to.</p>
            </div>
            <div className="animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Product</h3>
              <ul className="space-y-2">
                <li><a href="https://alexlistens.com/pricing" className="text-white/70 hover:text-white transition-all duration-200 hover:translate-x-1 inline-block text-sm sm:text-base">Pricing</a></li>
                <li><a href="https://alexlistens.com/tos" className="text-white/70 hover:text-white transition-all duration-200 hover:translate-x-1 inline-block text-sm sm:text-base">Terms of Service</a></li>
                <li><a href="https://alexlistens.com/privacy" className="text-white/70 hover:text-white transition-all duration-200 hover:translate-x-1 inline-block text-sm sm:text-base">Privacy Policy</a></li>
              </ul>
            </div>
            <div className="animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Support</h3>
              <p className="text-white/80 text-sm sm:text-base mb-2">Questions? Reach out to us</p>
              <a href="mailto:support@alexlistens.com" className="text-white/70 hover:text-white transition-all duration-200 hover:scale-105 inline-block text-sm sm:text-base break-all">
                support@alexlistens.com
              </a>
            </div>
          </div>
          <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-white/10 text-center">
            <p className="text-white/60 text-xs sm:text-base">&copy; 2025 AlexListens.com, FranklinAlexander Ventures, LLC and affiliated entities. All Rights Reserved.</p>
          </div>
        </div>
      </footer>

      <AuthModals
        isSignInOpen={isSignInOpen}
        isSignUpOpen={isSignUpOpen}
        onCloseSignIn={() => setIsSignInOpen(false)}
        onCloseSignUp={() => setIsSignUpOpen(false)}
        onSwitchToSignUp={() => {
          setIsSignInOpen(false);
          setIsSignUpOpen(true);
        }}
      />
    </div>
  );
}
