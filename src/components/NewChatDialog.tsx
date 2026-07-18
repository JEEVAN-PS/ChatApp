import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  serverTimestamp,
  or
} from 'firebase/firestore';
import { UserProfile } from '../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { ScrollArea } from "./ui/scroll-area";
import { Plus, Search, UserPlus, Users, ArrowRight, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface NewChatDialogProps {
  onChatCreated: (chatId: string) => void;
}

export default function NewChatDialog({ onChatCreated }: NewChatDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    if (open) {
      fetchUsers();
      setIsGroupMode(false);
      setSelectedUsers([]);
      setGroupName('');
      setSearch('');
    }
  }, [open]);

  const fetchUsers = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users'),
        where('uid', '!=', auth.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const userData = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(userData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const createPrivateChat = async (otherUser: UserProfile) => {
    if (!auth.currentUser) return;

    try {
      // Check if private chat already exists
      const q = query(
        collection(db, 'chats'),
        where('type', '==', 'private'),
        where('participants', 'array-contains', auth.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const existingChat = snapshot.docs.find(doc => {
        const data = doc.data();
        return data.participants.includes(otherUser.uid);
      });

      if (existingChat) {
        onChatCreated(existingChat.id);
        setOpen(false);
        return;
      }

      // Create new chat
      const newChatRef = await addDoc(collection(db, 'chats'), {
        type: 'private',
        participants: [auth.currentUser.uid, otherUser.uid],
        createdAt: serverTimestamp(),
        lastMessage: null
      });

      onChatCreated(newChatRef.id);
      setOpen(false);
    } catch (error) {
      console.error('Error creating private chat:', error);
    }
  };

  const createGroupChat = async () => {
    if (!auth.currentUser || selectedUsers.length < 1 || !groupName.trim()) return;

    try {
      const participants = [auth.currentUser.uid, ...selectedUsers];
      
      const newChatRef = await addDoc(collection(db, 'chats'), {
        type: 'group',
        name: groupName.trim(),
        participants: participants,
        createdAt: serverTimestamp(),
        lastMessage: null
      });

      onChatCreated(newChatRef.id);
      setOpen(false);
    } catch (error) {
      console.error('Error creating group chat:', error);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-full h-12 w-12 shadow-lg bg-[#00A884] hover:bg-[#008f6f] text-white transition-colors outline-none cursor-pointer">
        <Plus className="h-6 w-6" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl border-none shadow-2xl bg-white">
        <DialogHeader className="p-6 pb-2 border-b border-zinc-100 bg-[#00A884] text-white">
          <DialogTitle className="text-lg font-semibold tracking-wide flex items-center gap-3">
            {isGroupMode ? (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20 -ml-2" onClick={() => setIsGroupMode(false)}>
                  <ArrowRight className="h-4 w-4 rotate-180" />
                </Button>
                New Group
              </>
            ) : 'New Chat'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col h-[450px]">
          {isGroupMode && (
            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50">
              <Input
                placeholder="Group Subject"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="bg-white border-zinc-200 h-11 rounded-xl focus-visible:ring-[#00A884]"
              />
              <div className="mt-2 text-xs text-zinc-500 font-medium">
                {selectedUsers.length} selected
              </div>
            </div>
          )}

          <div className="px-6 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-zinc-50 border-none h-11 rounded-xl"
              />
            </div>
          </div>

          {!isGroupMode && (
            <div className="flex flex-col border-b border-zinc-100 pb-2 mb-2">
              <button
                onClick={() => setIsGroupMode(true)}
                className="flex items-center gap-4 px-6 py-3 hover:bg-zinc-50 transition-all text-left"
              >
                <div className="h-11 w-11 rounded-full bg-[#00A884] flex items-center justify-center text-white shadow-sm shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <h4 className="font-semibold text-zinc-900">New Group</h4>
              </button>
            </div>
          )}

          <ScrollArea className="flex-1 px-4">
            <div className="flex flex-col gap-1 pb-4">
              <div className="text-xs font-semibold text-[#00A884] uppercase tracking-wider px-2 pt-2 mb-1">
                Contacts
              </div>
              {loading ? (
                <div className="text-center py-10 text-zinc-400 text-sm">Loading users...</div>
              ) : filteredUsers.filter(u => u.uid !== 'ai_bot').length === 0 ? (
                <div className="text-center py-10 text-zinc-400 text-sm">No users found.</div>
              ) : (
                filteredUsers
                  .filter(user => user.uid !== 'ai_bot')
                  .map((user) => {
                  const isSelected = selectedUsers.includes(user.uid);
                  
                  return (
                    <button
                      key={user.uid}
                      onClick={() => isGroupMode ? toggleUserSelection(user.uid) : createPrivateChat(user)}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-xl transition-all text-left group",
                        isSelected ? "bg-zinc-100" : "hover:bg-zinc-50"
                      )}
                    >
                      <div className="relative">
                        <Avatar className="h-11 w-11 border border-zinc-200">
                          <AvatarImage src={user.photoURL || undefined} />
                          <AvatarFallback className="bg-zinc-200 text-zinc-600 font-medium">
                            {(user.displayName || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {isGroupMode && isSelected && (
                          <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-[#00A884] rounded-full flex items-center justify-center border-2 border-white">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-zinc-900 truncate">
                          {user.displayName || 'User'}
                        </h4>
                        <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                      </div>
                      {!isGroupMode && <UserPlus className="h-5 w-5 text-zinc-300 group-hover:text-zinc-600 transition-colors" />}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {isGroupMode && selectedUsers.length > 0 && groupName.trim() && (
            <div className="p-4 border-t border-zinc-100 bg-white absolute bottom-0 left-0 right-0">
              <Button 
                onClick={createGroupChat}
                className="w-full bg-[#00A884] hover:bg-[#008f6f] text-white rounded-xl h-12 font-semibold text-base shadow-lg"
              >
                Create Group
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
