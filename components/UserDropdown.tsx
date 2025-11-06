import { Menu, Transition } from '@headlessui/react';
import { Fragment, useEffect, useState } from 'react';
import { signOut, User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import md5 from 'md5';
import { RefreshCw, LayoutDashboard, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { isAdmin } from '../lib/admin';

interface UserDropdownProps {
  user: User;
  onRefresh?: () => void;
}

interface UserData {
  username: string;
  firstName: string;
  lastName: string;
}

export default function UserDropdown({ user, onRefresh }: UserDropdownProps) {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();

  const fetchUserData = async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData({
          username: data.username,
          firstName: data.firstName,
          lastName: data.lastName,
        });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [user.uid]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleRefresh = async () => {
    await fetchUserData(true);
    // Only call onRefresh when user manually clicks refresh
    if (onRefresh) {
      onRefresh();
    }
  };

  const handleDashboard = () => {
    router.push('/dashboard');
  };

  const handleAdmin = () => {
    router.push('/admin');
  };

  const userIsAdmin = isAdmin(user);

  const gravatarUrl = `https://www.gravatar.com/avatar/${md5(user.email.toLowerCase().trim())}?d=mp`;

  const LoadingPulse = ({ className }: { className: string }) => (
    <div className={`${className} bg-gray-700 animate-[pulse_1.5s_ease-in-out_infinite] rounded`} />
  );

  return (
    <Menu as="div" className="relative inline-block text-left z-50">
      <Menu.Button className="flex items-center space-x-2 sm:space-x-3 group">
        <div className="relative">
          {isLoading ? (
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gray-700 animate-[pulse_1.5s_ease-in-out_infinite]" />
          ) : (
            <img
              src={gravatarUrl}
              alt="User avatar"
              className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white/10 transition-all duration-200 group-hover:border-white/20"
            />
          )}
        </div>
        <span className="text-white min-w-[60px] sm:min-w-[80px] text-sm sm:text-base">
          {isLoading ? (
            <LoadingPulse className="w-16 sm:w-20 h-3 sm:h-4" />
          ) : (
            <span className="transition-colors duration-200 group-hover:text-blue-200 truncate max-w-[80px] sm:max-w-none block">
              {userData?.username}
            </span>
          )}
        </span>
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-200"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-150"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-3 w-56 sm:w-64 origin-top-right rounded-xl bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
          <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-700/50">
            {isLoading ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <LoadingPulse className="w-10 h-10 sm:w-12 sm:h-12 rounded-full" />
                  <div className="space-y-2">
                    <LoadingPulse className="w-20 sm:w-24 h-3 sm:h-4" />
                    <LoadingPulse className="w-16 sm:w-20 h-2 sm:h-3" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                    <img
                      src={gravatarUrl}
                      alt="User avatar"
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-gray-700/50 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-200 block truncate">{userData?.username}</span>
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {userData?.firstName} {userData?.lastName}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0 ml-2"
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 truncate mb-2 sm:mb-3">{user.email}</p>
              </>
            )}
          </div>
          <div className="p-1">
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={handleDashboard}
                  className={`${
                    active ? 'bg-gray-800/80' : ''
                  } text-gray-200 w-full text-left px-3 py-2 text-sm rounded-md transition-colors duration-150 flex items-center space-x-2`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </button>
              )}
            </Menu.Item>
            {userIsAdmin && (
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={handleAdmin}
                    className={`${
                      active ? 'bg-gray-800/80' : ''
                    } text-yellow-400 w-full text-left px-3 py-2 text-sm rounded-md transition-colors duration-150 flex items-center space-x-2`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin Panel</span>
                  </button>
                )}
              </Menu.Item>
            )}
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={handleSignOut}
                  className={`${
                    active ? 'bg-gray-800/80' : ''
                  } text-red-400 w-full text-left px-3 py-2 text-sm rounded-md transition-colors duration-150`}
                >
                  Sign Out
                </button>
              )}
            </Menu.Item>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}