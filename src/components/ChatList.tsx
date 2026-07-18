import { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { Chat, UserProfile } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';

interface ChatListProps {
  onSelectChat: (chat: Chat) => void;
  selectedChatId?: string;
  searchQuery?: string;
}

export default function ChatList({ onSelectChat, selectedChatId, searchQuery = '' }: ChatListProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [otherUsers, setOtherUsers] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      setChats(chatData);

      // Fetch user profiles for private chats
      chatData.forEach(async (chat) => {
        if (chat.type === 'private') {
          const otherId = chat.participants.find(id => id !== auth.currentUser?.uid);
          if (otherId && !otherUsers[otherId]) {
            const userSnap = await getDoc(doc(db, 'users', otherId));
            if (userSnap.exists()) {
              setOtherUsers(prev => ({
                ...prev,
                [otherId]: userSnap.data() as UserProfile
              }));
            }
          }
        }
      });
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const getChatInfo = (chat: Chat) => {
    if (chat.type === 'group') {
      return {
        name: chat.name || 'Group Chat',
        photo: null,
        initials: 'GC'
      };
    }
    const otherId = chat.participants.find(id => id !== auth.currentUser?.uid);
    const user = otherId ? otherUsers[otherId] : null;
    return {
      name: user?.displayName || user?.email || 'User',
      photo: user?.photoURL,
      initials: (user?.displayName || 'U').charAt(0).toUpperCase()
    };
  };

  const filteredChats = chats.filter(chat => {
    if (!searchQuery.trim()) return true;
    const info = getChatInfo(chat);
    
    // Search by chat/user name
    if (info.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
    
    // Search by last message preview (since downloading all DB messages to client is expensive)
    if (chat.lastMessage?.text.toLowerCase().includes(searchQuery.toLowerCase())) return true;

    return false;
  });

  return (
    <ScrollArea className="h-[calc(100vh-140px)]">
      <div className="flex flex-col gap-1 p-2">
        {filteredChats.length === 0 ? (
          <div className="text-center py-10 text-zinc-400 text-sm">
            {searchQuery ? "No conversations match your search." : "No conversations yet."}
          </div>
        ) : (
          filteredChats.map((chat) => {
            const info = getChatInfo(chat);
            const isSelected = selectedChatId === chat.id;
            const myUnreadCount = chat.unreadCount?.[auth.currentUser?.uid || ''] || 0;
            const hasUnread = myUnreadCount > 0;

            return (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                  isSelected 
                    ? "bg-[#F0F2F5]" 
                    : "hover:bg-[#F0F2F5] active:scale-[0.98]"
                )}
              >
                <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                  <AvatarImage src={info.photo || undefined} />
                  <AvatarFallback className="bg-zinc-900 text-white font-medium">
                    {info.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className={cn("font-semibold truncate", hasUnread ? "text-[#111B21]" : "text-[#111B21]")}>
                      {info.name}
                    </h3>
                    {chat.lastMessage && (
                      <span className={cn(
                        "text-[12px] font-medium tracking-wide",
                        hasUnread ? "text-[#00A884]" : "text-[#667781]"
                      )}>
                        {formatDistanceToNow(chat.lastMessage.timestamp?.toDate() || new Date(), { addSuffix: false })}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={cn(
                      "text-sm truncate pr-2",
                      hasUnread ? "text-[#111B21] font-semibold" : "text-[#667781]"
                    )}>
                      {chat.lastMessage ? chat.lastMessage.text : 'No messages yet'}
                    </p>
                    {hasUnread && (
                      <div className="bg-[#00A884] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                        {myUnreadCount}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}
