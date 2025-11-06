'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, doc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { isAdmin } from '../../lib/admin';
import { getWalletBalance, loadMinutes, formatSecondsToMinutes } from '../../lib/wallet';
import UserDropdown from '../../components/UserDropdown';
import { ArrowLeft, Users, Wallet, Phone, BarChart3, Search, Plus, RefreshCw, Shield, Eye, EyeOff, Copy } from 'lucide-react';

interface UserData {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  alexEthnicity?: string;
}

interface UserWithStats extends UserData {
  walletBalance: number;
  totalCalls: number;
  lastCallAt?: Date;
}

interface SystemStats {
  totalUsers: number;
  totalWallets: number;
  totalBalance: number;
  totalCalls: number;
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [systemStats, setSystemStats] = useState<SystemStats>({
    totalUsers: 0,
    totalWallets: 0,
    totalBalance: 0,
    totalCalls: 0
  });
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [addingMinutes, setAddingMinutes] = useState(false);
  const [minutesToAdd, setMinutesToAdd] = useState<string>('10');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (!isAdmin(currentUser)) {
          router.push('/');
          return;
        }
        setUser(currentUser);
        await loadAllData();
      } else {
        router.push('/');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers(users);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(
        users.filter(u => 
          u.email?.toLowerCase().includes(query) ||
          u.username?.toLowerCase().includes(query) ||
          u.firstName?.toLowerCase().includes(query) ||
          u.lastName?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, users]);

  const loadAllData = async () => {
    setIsRefreshing(true);
    try {
      // Load all users
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      
      const usersList: UserWithStats[] = [];
      let totalCalls = 0;
      let totalBalance = 0;
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data() as UserData;
        const userId = userDoc.id;
        
        // Get wallet balance
        const walletBalance = await getWalletBalance(userId);
        totalBalance += walletBalance;
        
        // Get call stats
        const statsRef = doc(db, 'callstats', userId);
        const statsDoc = await getDoc(statsRef);
        const totalCallsForUser = statsDoc.exists() ? (statsDoc.data().totalCalls || 0) : 0;
        totalCalls += totalCallsForUser;
        
        usersList.push({
          ...userData,
          uid: userId,
          walletBalance,
          totalCalls: totalCallsForUser,
          lastCallAt: statsDoc.exists() && statsDoc.data().lastCallAt 
            ? statsDoc.data().lastCallAt.toDate() 
            : undefined
        });
      }
      
      // Sort by total calls (descending)
      usersList.sort((a, b) => b.totalCalls - a.totalCalls);
      
      setUsers(usersList);
      setFilteredUsers(usersList);
      
      // Get wallet count
      const walletsRef = collection(db, 'wallets');
      const walletsSnapshot = await getDocs(walletsRef);
      
      setSystemStats({
        totalUsers: usersList.length,
        totalWallets: walletsSnapshot.size,
        totalBalance,
        totalCalls
      });
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddMinutes = async () => {
    if (!selectedUser || !minutesToAdd) return;
    
    const minutes = parseInt(minutesToAdd);
    if (isNaN(minutes) || minutes <= 0) {
      alert('Please enter a valid number of minutes');
      return;
    }
    
    setAddingMinutes(true);
    try {
      await loadMinutes(selectedUser.uid, minutes);
      alert(`Successfully added ${minutes} minutes to ${selectedUser.email}`);
      setSelectedUser(null);
      setMinutesToAdd('10');
      await loadAllData();
    } catch (error) {
      console.error('Error adding minutes:', error);
      alert('Failed to add minutes. Please try again.');
    } finally {
      setAddingMinutes(false);
    }
  };

  const handleRefresh = async () => {
    await loadAllData();
  };

  const handleCreateUser = async () => {
    if (!newEmail) {
      alert('Email is required');
      return;
    }
    try {
      setCreating(true);
      setCreatedTempPassword(null);
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          email: newEmail.trim(),
          firstName: newFirstName.trim() || undefined,
          lastName: newLastName.trim() || undefined,
          username: newUsername.trim() || undefined,
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create user');
      }

      // Show temp password and refresh table
      setCreatedTempPassword(data.tempPassword);
      setNewEmail('');
      setNewFirstName('');
      setNewLastName('');
      setNewUsername('');
      await loadAllData();
    } catch (err) {
      console.error('Create user failed:', err);
      alert((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A2647] via-[#144272] to-[#205295] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-48"></div>
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin(user)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A2647] via-[#144272] to-[#205295]">
      {/* Header */}
      <header className="bg-black/10 backdrop-blur-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/')}
                className="p-2 text-white hover:text-blue-200 transition-colors rounded-full hover:bg-white/10"
                title="Back to Home"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <Shield className="w-6 h-6 text-yellow-400" />
              <h1 className="text-xl font-semibold text-white">Admin Dashboard</h1>
            </div>
            <UserDropdown user={user} onRefresh={handleRefresh} />
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* System Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Users</p>
                <p className="text-3xl font-bold text-[#0A2647]">{systemStats.totalUsers}</p>
              </div>
              <Users className="w-8 h-8 text-[#2C74B3]" />
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Balance</p>
                <p className="text-3xl font-bold text-[#0A2647]">
                  {formatSecondsToMinutes(systemStats.totalBalance)}
                </p>
              </div>
              <Wallet className="w-8 h-8 text-green-600" />
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Calls</p>
                <p className="text-3xl font-bold text-[#0A2647]">{systemStats.totalCalls}</p>
              </div>
              <Phone className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Active Wallets</p>
                <p className="text-3xl font-bold text-[#0A2647]">{systemStats.totalWallets}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Search and Actions */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search users by email, username, or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2C74B3] focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create User
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-4 py-2 bg-[#2C74B3] text-white rounded-lg hover:bg-[#205295] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wallet Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Calls
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.firstName && user.lastName 
                          ? `${user.firstName} ${user.lastName}`
                          : user.username || 'N/A'}
                      </div>
                      {user.username && (
                        <div className="text-sm text-gray-500">@{user.username}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${
                        user.walletBalance <= 60 ? 'text-red-600' :
                        user.walletBalance <= 300 ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {formatSecondsToMinutes(user.walletBalance)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.totalCalls}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="text-[#2C74B3] hover:text-[#205295] font-medium"
                      >
                        Manage Wallet
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No users found</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Minutes Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold text-[#0A2647] mb-4">Manage Wallet</h2>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">User: {selectedUser.email}</p>
              <p className="text-sm text-gray-600 mb-4">
                Current Balance: <span className="font-semibold">{formatSecondsToMinutes(selectedUser.walletBalance)}</span>
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add Minutes
              </label>
              <input
                type="number"
                min="1"
                value={minutesToAdd}
                onChange={(e) => setMinutesToAdd(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2C74B3] focus:border-transparent text-gray-900 placeholder:text-gray-400 bg-white"
                placeholder="Enter minutes"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setMinutesToAdd('10');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 disabled:text-gray-400"
                disabled={addingMinutes}
              >
                Cancel
              </button>
              <button
                onClick={handleAddMinutes}
                disabled={addingMinutes}
                className="flex-1 px-4 py-2 bg-[#2C74B3] text-white rounded-lg hover:bg-[#205295] transition-colors disabled:opacity-50"
              >
                {addingMinutes ? 'Adding...' : 'Add Minutes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold text-[#0A2647] mb-4">Create New User</h2>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2C74B3] focus:border-transparent"
                  placeholder="user@example.com"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2C74B3] focus:border-transparent"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2C74B3] focus:border-transparent"
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username (optional)</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2C74B3] focus:border-transparent"
                  placeholder="username"
                />
              </div>
            </div>

            {createdTempPassword && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-green-800 font-medium mb-2">Temporary password created</p>
                <div className="flex items-center gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    readOnly
                    value={createdTempPassword}
                    className="flex-1 px-3 py-2 border border-green-300 rounded-lg bg-white text-green-900"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-2 text-green-700 hover:text-green-900"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(createdTempPassword)}
                    className="p-2 text-green-700 hover:text-green-900"
                    title="Copy password"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-green-700 mt-2">Share this password securely with the user. They will be required to change it on first login.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewEmail('');
                  setNewFirstName('');
                  setNewLastName('');
                  setNewUsername('');
                  setCreatedTempPassword(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 disabled:text-gray-400"
                disabled={creating}
              >
                Close
              </button>
              <button
                onClick={handleCreateUser}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


