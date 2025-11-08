import { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { initWalletForUser } from '../lib/wallet';

interface AuthModalsProps {
  isSignInOpen: boolean;
  isSignUpOpen: boolean;
  onCloseSignIn: () => void;
  onCloseSignUp: () => void;
  onSwitchToSignUp: () => void;
}

export default function AuthModals({ 
  isSignInOpen, 
  isSignUpOpen, 
  onCloseSignIn, 
  onCloseSignUp,
  onSwitchToSignUp 
}: AuthModalsProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [error, setError] = useState('');
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetPasswordSent, setResetPasswordSent] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');

  useEffect(() => {
    const checkUsername = async () => {
      if (username.length < 3) return;
      
      const usernameDoc = await getDoc(doc(db, 'usernames', username));
      setUsernameAvailable(!usernameDoc.exists());
    };

    const debounceTimer = setTimeout(checkUsername, 500);
    return () => clearTimeout(debounceTimer);
  }, [username]);

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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Initialize wallet on login (for existing users who might not have wallets)
      await initWalletForUser(userCredential.user.uid);
      // Ensure alexEthnicity field exists for existing users
      await ensureAlexEthnicityField(userCredential.user.uid);
      onCloseSignIn();
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameAvailable) {
      setError('Username is not available');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create user document with alexEthnicity field
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        firstName,
        lastName,
        username,
        email,
        alexEthnicity: 'English' // Default value for new users
      });
      
      // Reserve username
      await setDoc(doc(db, 'usernames', username), {
        uid: userCredential.user.uid
      });
      
      // Initialize wallet with 600 seconds (10 minutes) using top-level wallets collection
      await initWalletForUser(userCredential.user.uid);
      
      onCloseSignUp();
    } catch (err) {
      setError('Error creating account');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetPasswordError('');
    setResetPasswordSent(false);

    if (!resetPasswordEmail) {
      setResetPasswordError('Please enter your email address');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, resetPasswordEmail);
      setResetPasswordSent(true);
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.code === 'auth/user-not-found') {
        setResetPasswordError('No account found with this email address');
      } else if (err.code === 'auth/invalid-email') {
        setResetPasswordError('Invalid email address');
      } else {
        setResetPasswordError('Failed to send reset email. Please try again.');
      }
    }
  };

  return (
    <>
      <Dialog open={isSignInOpen} onClose={onCloseSignIn} className="relative z-50">
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-4">
          <Dialog.Panel className="popover-glass bg-gray-900/95 p-6 sm:p-8 w-full max-w-sm mx-4 text-white">
            <Dialog.Title className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-white">Sign In</Dialog.Title>
            <form onSubmit={handleSignIn} className="space-y-4 sm:space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-glass mt-1 block w-full bg-gray-800/50 border-gray-600/50 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 text-sm sm:text-base"
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-200">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetPassword(true);
                      setResetPasswordEmail(email);
                      setResetPasswordSent(false);
                      setResetPasswordError('');
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-glass mt-1 block w-full bg-gray-800/50 border-gray-600/50 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 text-sm sm:text-base"
                  required
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                className="btn-glass w-full bg-blue-600/80 text-white py-2.5 sm:py-3 px-4 rounded-xl hover:bg-blue-700/80 transition-colors font-medium text-sm sm:text-base"
              >
                Sign In
              </button>
              <p className="text-sm text-center text-gray-300">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchToSignUp}
                  className="text-blue-400 hover:text-blue-300 font-medium"
                >
                  Sign Up here
                </button>
              </p>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={showResetPassword} onClose={() => {
        setShowResetPassword(false);
        setResetPasswordEmail('');
        setResetPasswordSent(false);
        setResetPasswordError('');
      }} className="relative z-50">
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-4">
          <Dialog.Panel className="popover-glass bg-gray-900/95 p-6 sm:p-8 w-full max-w-sm mx-4 text-white">
            <Dialog.Title className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-white">Reset Password</Dialog.Title>
            {resetPasswordSent ? (
              <div className="space-y-4">
                <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                  <p className="text-green-300 text-sm sm:text-base">
                    Password reset email sent! Check your inbox at <span className="font-semibold">{resetPasswordEmail}</span>
                  </p>
                </div>
                <p className="text-gray-300 text-xs sm:text-sm">
                  Click the link in the email to reset your password. The link will expire in 1 hour.
                </p>
                <button
                  onClick={() => {
                    setShowResetPassword(false);
                    setResetPasswordEmail('');
                    setResetPasswordSent(false);
                    setResetPasswordError('');
                  }}
                  className="btn-glass w-full bg-blue-600/80 text-white py-2.5 sm:py-3 px-4 rounded-xl hover:bg-blue-700/80 transition-colors font-medium text-sm sm:text-base"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">Email</label>
                  <input
                    type="email"
                    value={resetPasswordEmail}
                    onChange={(e) => setResetPasswordEmail(e.target.value)}
                    className="input-glass mt-1 block w-full bg-gray-800/50 border-gray-600/50 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 text-sm sm:text-base"
                    placeholder="Enter your email address"
                    required
                  />
                </div>
                {resetPasswordError && <p className="text-red-400 text-sm">{resetPasswordError}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetPassword(false);
                      setResetPasswordEmail('');
                      setResetPasswordSent(false);
                      setResetPasswordError('');
                    }}
                    className="btn-glass flex-1 px-4 py-2 border border-gray-600 rounded-xl hover:bg-gray-800/50 transition-colors text-gray-200 text-sm sm:text-base"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-glass flex-1 bg-blue-600/80 text-white py-2.5 sm:py-3 px-4 rounded-xl hover:bg-blue-700/80 transition-colors font-medium text-sm sm:text-base"
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </Dialog.Panel>
        </div>
      </Dialog>

      <Dialog open={isSignUpOpen} onClose={onCloseSignUp} className="relative z-50">
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-4">
          <Dialog.Panel className="popover-glass bg-gray-900/95 p-6 sm:p-8 w-full max-w-sm mx-4 text-white max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-white">Sign Up</Dialog.Title>
            <form onSubmit={handleSignUp} className="space-y-4 sm:space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input-glass mt-1 block w-full bg-gray-800/50 border-gray-600/50 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 text-sm sm:text-base"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input-glass mt-1 block w-full bg-gray-800/50 border-gray-600/50 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 text-sm sm:text-base"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`mt-1 block w-full rounded-md bg-gray-800 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 text-sm sm:text-base ${
                    username.length >= 3 && !usernameAvailable ? 'border-red-500' : ''
                  }`}
                  required
                />
                {username.length >= 3 && !usernameAvailable && (
                  <p className="text-red-400 text-sm mt-1">Username is not available</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-glass mt-1 block w-full bg-gray-800/50 border-gray-600/50 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 text-sm sm:text-base"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-glass mt-1 block w-full bg-gray-800/50 border-gray-600/50 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 text-sm sm:text-base"
                  required
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                className="btn-glass w-full bg-blue-600/80 text-white py-2.5 sm:py-3 px-4 rounded-xl hover:bg-blue-700/80 transition-colors font-medium text-sm sm:text-base"
              >
                Sign Up
              </button>
              <div className="text-xs text-gray-400 text-center">
                By signing up, you'll receive 10 minutes of free talk time!
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}