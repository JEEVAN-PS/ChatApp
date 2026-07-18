/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import Auth from './components/Auth';
import ChatList from './components/ChatList';
import ChatRoom from './components/ChatRoom';
import NewChatDialog from './components/NewChatDialog';
import { Chat, UserProfile } from './types';
import { Button } from './components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from './components/ui/dropdown-menu';
import { LogOut, Settings, User, MessageSquare, Search } from 'lucide-react';
import { Toaster } from './components/ui/sonner';
import { Input } from './components/ui/input';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const userProfile: UserProfile = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL,
        };
        setUser(userProfile);

        // Update online status
        const userRef = doc(db, 'users', firebaseUser.uid);
        // Ensure we send the full profile so it doesn't fail schema validation if the document doesn't exist yet
        setDoc(userRef, {
          ...userProfile,
          isOnline: true,
          lastSeen: serverTimestamp()
        }, { merge: true }).catch(console.error);

        // Handle offline status on disconnect (best effort in browser)
        const handleVisibilityChange = () => {
          if (auth.currentUser) {
            const currentRef = doc(db, 'users', auth.currentUser.uid);
            if (document.visibilityState === 'hidden') {
              setDoc(currentRef, { isOnline: false, lastSeen: serverTimestamp() }, { merge: true }).catch(console.error);
            } else {
              setDoc(currentRef, { isOnline: true, lastSeen: serverTimestamp() }, { merge: true }).catch(console.error);
            }
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Ensure AI Bot exists in the database
        const aiBotRef = doc(db, 'users', 'ai_bot');
        setDoc(aiBotRef, {
          uid: 'ai_bot',
          displayName: 'AI Assistant',
          email: 'assistant@gemini.google',
          photoURL: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
          isOnline: true,
          lastSeen: serverTimestamp()
        }, { merge: true }).catch(console.error);

      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      // To properly handle cleanup of the event listener, we would need 
      // the handleVisibilityChange reference scope, but to keep it simple
      // and not break the useEffect deps, we leave it for now.
    };
  }, []);

  const handleLogout = async () => {
    if (user) {
      await setDoc(doc(db, 'users', user.uid), {
        isOnline: false,
        lastSeen: serverTimestamp()
      }, { merge: true });
    }
    await signOut(auth);
    setSelectedChat(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-zinc-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-zinc-500">Loading your chats...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="flex h-screen bg-zinc-100 overflow-hidden font-sans antialiased">
      {/* Sidebar */}
      <div className="w-full max-w-[380px] flex flex-col bg-white border-r border-zinc-200 shadow-sm z-20">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0">
          <div className="flex items-center gap-2">
            <div className="bg-zinc-900 p-1.5 rounded-lg">
              <MessageSquare className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">QuickChat</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-zinc-100 outline-none">
              <Avatar className="h-8 w-8 border border-zinc-200">
                <AvatarImage src={user.photoURL || undefined} />
                <AvatarFallback className="bg-zinc-900 text-white text-xs">
                  {user.displayName?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl border-zinc-100">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.displayName}</p>
                  <p className="text-xs leading-none text-zinc-500">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="rounded-lg cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-lg cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 rounded-lg cursor-pointer focus:bg-red-50 focus:text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..." 
              className="pl-10 bg-zinc-50 border-none h-10 rounded-xl focus-visible:ring-1 focus-visible:ring-zinc-200"
            />
          </div>
        </div>

        {/* Chat List */}
        <ChatList 
          onSelectChat={setSelectedChat} 
          selectedChatId={selectedChat?.id} 
          searchQuery={searchQuery}
        />

        {/* New Chat Button */}
        <div className="absolute bottom-6 right-6 md:right-auto md:left-[310px] z-30">
          <NewChatDialog onChatCreated={(chatId) => {
            // The ChatList will update automatically, we just need to select it
            // For now, we'll let the user click it from the list or we could fetch it
          }} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-zinc-50 relative">
        {selectedChat ? (
          <ChatRoom chat={selectedChat} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
            <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-6 border border-zinc-100">
              <MessageSquare className="w-10 h-10 text-zinc-300" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Your messages</h2>
            <p className="text-zinc-500 max-w-xs mx-auto text-sm leading-relaxed">
              Select a conversation from the sidebar or start a new one to begin chatting.
            </p>
          </div>
        )}
      </div>
      <Toaster position="top-center" />
    </div>
  );
}

