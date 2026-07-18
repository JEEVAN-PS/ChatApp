import React, { useEffect, useState, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc,
  getDoc,
  writeBatch,
  increment,
  arrayUnion
} from 'firebase/firestore';
import { Chat, Message, UserProfile } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Send, MoreVertical, Phone, Video, Check, CheckCheck, Paperclip, ImageIcon, Smile, Reply, Trash2, X, Ban, Mic, Square, Play, Pause, FileText, Download, Search } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from './ui/dropdown-menu';

interface ChatRoomProps {
  chat: Chat;
}

export default function ChatRoom({ chat }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [liveChat, setLiveChat] = useState<Chat>(chat);
  
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Typing state
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monitor the Chat document in real-time for typing updates
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'chats', chat.id), (docSnap) => {
      if (docSnap.exists()) {
        setLiveChat({ id: docSnap.id, ...docSnap.data() } as Chat);
      }
    });
    return () => unsubscribe();
  }, [chat.id]);

  // Fetch other user profile
  useEffect(() => {
    let unsubscribe: () => void = () => {};
    
    if (chat.type === 'private') {
      const otherId = chat.participants.find(id => id !== auth.currentUser?.uid);
      if (otherId) {
        // Use onSnapshot to get real-time online/lastSeen updates
        unsubscribe = onSnapshot(doc(db, 'users', otherId), (snap) => {
          if (snap.exists()) {
             const data = snap.data() as UserProfile;
             setOtherUser(data);
          }
        });
      }
    }
    return () => unsubscribe();
  }, [chat.id, chat.participants]);

  // Handle immediate click to reset counters when chat room mounts
  useEffect(() => {
    if (auth.currentUser && chat.id) {
       updateDoc(doc(db, 'chats', chat.id), {
          [`unreadCount.${auth.currentUser.uid}`]: 0
       }).catch(console.error);
    }
  }, [chat.id]);

  // Fetch messages and handle read receipts
  useEffect(() => {
    const q = query(
      collection(db, 'chats', chat.id, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as Message)
        .filter(msg => !msg.deletedFor?.includes(auth.currentUser?.uid || ''));
      setMessages(msgData);
      
      // Auto-mark messages as read when we view them
      if (auth.currentUser) {
        let hasUnreadLocal = false;
        const unreadMessages = snapshot.docs.filter(doc => {
          const data = doc.data() as Message;
          if (data.senderId !== auth.currentUser?.uid && data.status !== 'read') {
             hasUnreadLocal = true;
             return true;
          }
          return false;
        });

        if (unreadMessages.length > 0) {
          const batch = writeBatch(db);
          unreadMessages.forEach(msgDoc => {
            batch.update(msgDoc.ref, { status: 'read' });
          });
          batch.commit().catch(console.error);
        }

        // Reset our unread counter if we have one
        if (hasUnreadLocal && chat.id) {
          updateDoc(doc(db, 'chats', chat.id), {
            [`unreadCount.${auth.currentUser.uid}`]: 0
          }).catch(console.error);
        }
      }

      // We rely on a separate useEffect to determine if we should scroll down
    });

    return () => unsubscribe();
  }, [chat.id]);

  // Handle smooth scroll to bottom when new messages are added, or initial load
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, chat.id]);

  // Upgrade 'sent' to 'delivered' permanently if the recipient is online
  useEffect(() => {
    if (auth.currentUser && otherUser?.isOnline && !isUploading) {
      const sentMessages = messages.filter(
        msg => msg.senderId === auth.currentUser?.uid && msg.status === 'sent' && msg.id
      );

      if (sentMessages.length > 0) {
        const batch = writeBatch(db);
        sentMessages.forEach(msg => {
          batch.update(doc(db, 'chats', chat.id, 'messages', msg.id), { status: 'delivered' });
        });
        batch.commit().catch(console.error);
      }
    }
  }, [messages, otherUser?.isOnline, chat.id, isUploading]);

  const handleSendMessage = async (
    e?: React.FormEvent, 
    media?: { type: 'image' | 'audio' | 'document'; url: string; fileName?: string; size?: number }
  ) => {
    if (e) e.preventDefault();
    if ((!newMessage.trim() && !media) || !auth.currentUser) return;

    const messageText = newMessage.trim();
    if (!media) setNewMessage('');

    try {
      const msgRef = collection(db, 'chats', chat.id, 'messages');
      const payload: any = {
        chatId: chat.id,
        senderId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        type: media ? media.type : 'text',
        status: otherUser?.isOnline ? 'delivered' : 'sent'
      };
      
      if (replyingTo) {
        payload.replyTo = {
          id: replyingTo.id,
          text: replyingTo.text || (replyingTo.imageUrl ? '📷 Photo' : replyingTo.audioUrl ? '🎤 Voice message' : replyingTo.documentUrl ? '📎 Document' : 'Message'),
          senderName: replyingTo.senderId === auth.currentUser.uid ? 'You' : chatName
        };
      }
      
      if (media) {
        if (media.type === 'image') payload.imageUrl = media.url;
        else if (media.type === 'audio') payload.audioUrl = media.url;
        else if (media.type === 'document') {
          payload.documentUrl = media.url;
          payload.fileName = media.fileName;
          payload.fileSize = media.size;
        }
      } else {
        payload.text = messageText;
      }

      await addDoc(msgRef, payload);
      setReplyingTo(null);

      // Increment counters for all OTHER participants
      const updatePayload: any = {
        lastMessage: {
          text: media ? (media.type === 'image' ? '📷 Photo' : media.type === 'audio' ? '🎤 Voice message' : '📎 Document') : messageText,
          senderId: auth.currentUser.uid,
          timestamp: serverTimestamp()
        }
      };

      chat.participants.forEach(participantId => {
        if (participantId !== auth.currentUser?.uid) {
          updatePayload[`unreadCount.${participantId}`] = increment(1);
        }
      });

      // Update last message in chat and clear typing
      updatePayload[`typing.${auth.currentUser.uid}`] = false;
      isTypingRef.current = false;
      await updateDoc(doc(db, 'chats', chat.id), updatePayload);

    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      updateDoc(doc(db, 'chats', chat.id), {
        [`typing.${uid}`]: true
      }).catch(console.error);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      updateDoc(doc(db, 'chats', chat.id), {
        [`typing.${uid}`]: false
      }).catch(console.error);
    }, 2000);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setIsUploading(true);
    try {
      const isImage = file.type.startsWith('image/');
      
      const processFile = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (e) => {
            if (isImage) {
              const img = new Image();
              img.src = e.target?.result as string;
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                  if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                  if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
              };
              img.onerror = (err) => reject(err);
            } else {
              resolve(e.target?.result as string);
            }
          };
          reader.onerror = (err) => reject(err);
        });
      };

      const dataUrl = await processFile(file);
      await handleSendMessage(undefined, {
        type: isImage ? 'image' : 'document',
        url: dataUrl,
        fileName: file.name,
        size: file.size
      });
    } catch (error) {
      console.error("Error processing file:", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Convert to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await handleSendMessage(undefined, {
            type: 'audio',
            url: base64Audio
          });
        };
        
        // Cleanup stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Stop but don't save
      mediaRecorderRef.current.onstop = () => {
        const stream = mediaRecorderRef.current?.stream;
        stream?.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const chatName = chat.type === 'group' ? chat.name : (otherUser?.displayName || otherUser?.email || 'User');
  const chatPhoto = chat.type === 'group' ? null : otherUser?.photoURL;
  
  // Extract who is typing
  const typingUsers = Object.entries(liveChat.typing || {})
    .filter(([uid, isTyping]) => isTyping && uid !== auth.currentUser?.uid)
    .map(([uid]) => uid);
  const isSomeoneTyping = typingUsers.length > 0;

  // Render online status
  const renderStatus = () => {
    if (isSomeoneTyping) return <span className="text-[#00A884] font-semibold italic">typing...</span>;
    if (chat.type === 'group') return `${chat.participants.length} participants`;
    if (!otherUser) return 'Offline';
    if (otherUser.isOnline) return <span className="text-emerald-500 font-semibold">Online</span>;
    if (otherUser.lastSeen) {
      try {
        // If it's a Firestore Timestamp, it has toDate(). If it's already a JS Date or server string, parse it.
        const date = typeof otherUser.lastSeen.toDate === 'function' ? otherUser.lastSeen.toDate() : new Date(otherUser.lastSeen);
        return `last seen at ${format(date, 'HH:mm')}`;
      } catch (e) {
        return 'Offline';
      }
    }
    return 'Offline';
  };

  const renderTicks = (status?: string, isMe?: boolean) => {
    if (!isMe) return null;
    
    if (status === 'read') {
      return <CheckCheck className="h-3.5 w-3.5 text-blue-500 ml-1 inline-block" />;
    } else if (status === 'delivered') {
      return <CheckCheck className="h-3.5 w-3.5 text-zinc-400 ml-1 inline-block" />;
    } else {
      return <Check className="h-3 w-3 text-zinc-400 ml-1 inline-block" />;
    }
  };

  const displayedMessages = messages.filter(msg => {
    if (!searchQuery.trim()) return true;
    return msg.text?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'chats', chat.id, 'messages', messageId), {
        [`reactions.${auth.currentUser.uid}`]: emoji
      });
    } catch (error) {
      console.error("Error adding reaction:", error);
    }
  };

  const handleDeleteForMe = async (messageId: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'chats', chat.id, 'messages', messageId), {
        deletedFor: arrayUnion(auth.currentUser.uid)
      });
    } catch (error) {
      console.error("Error deleting for me:", error);
    }
  };

  const handleDeleteForEveryone = async (messageId: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'chats', chat.id, 'messages', messageId), {
        isDeleted: true,
        text: null,
        imageUrl: null
      });
    } catch (error) {
      console.error("Error deleting for everyone:", error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#EFEAE2]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-200 bg-[#F0F2F5] sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-zinc-200">
            <AvatarImage src={chatPhoto || undefined} />
            <AvatarFallback className="bg-zinc-400 text-white font-medium">
              {chatName?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <h2 className="font-semibold text-[#111B21] leading-none mb-1">{chatName}</h2>
            <p className="text-[13px] text-[#667781] leading-none transition-all">
              {renderStatus()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-[#54656F] hover:bg-black/5 rounded-full hidden sm:inline-flex">
            <Video className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-[#54656F] hover:bg-black/5 rounded-full hidden sm:inline-flex">
            <Phone className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-[#54656F] hover:bg-black/5 rounded-full"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-[#54656F] hover:bg-black/5 rounded-full">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Conditional Search Bar */}
      {isSearchOpen && (
        <div className="bg-white p-2 border-b border-zinc-200 flex items-center gap-2 animate-in slide-in-from-top-2 z-10 relative shadow-sm">
          <Input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 bg-zinc-100 border-none h-9 focus-visible:ring-0 text-[14px]"
          />
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-zinc-500 hover:text-zinc-700"
            onClick={() => {
              setIsSearchOpen(false);
              setSearchQuery('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-center opacity-95">
        <div className="flex flex-col gap-2 max-w-4xl mx-auto min-h-full justify-end">
          {displayedMessages.map((msg, idx) => {
            const isMe = msg.senderId === auth.currentUser?.uid;
            const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;
            
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[85%] md:max-w-[75%]",
                  isMe ? "self-end items-end" : "self-start items-start"
                )}
              >
                <div className={cn("flex items-center gap-2 group relative", isMe ? "flex-row-reverse" : "flex-row")}>
                  <div
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl text-[15px] shadow-sm relative",
                      isMe 
                        ? "bg-[#D9FDD3] text-[#111B21] rounded-tr-none" 
                        : "bg-white text-[#111B21] rounded-tl-none",
                      hasReactions && "mb-3"
                    )}
                  >
                    {msg.isDeleted ? (
                      <div className="flex items-center text-zinc-500 italic pr-8 pb-1">
                        <Ban className="h-4 w-4 mr-1.5" />
                        You deleted this message
                      </div>
                    ) : (
                      <>
                        {/* Reply Quote Block */}
                        {msg.replyTo && (
                          <div className="bg-black/5 rounded-lg p-2 mb-1 border-l-4 border-[#00A884] text-sm overflow-hidden">
                            <span className="font-semibold text-[#00A884] block text-[13px] mb-0.5">
                              {msg.replyTo.senderName}
                            </span>
                            <span className="text-zinc-600 line-clamp-2 leading-tight">
                              {msg.replyTo.text}
                            </span>
                          </div>
                        )}

                        {/* Media content */}
                        {msg.type === 'document' ? (
                          <div className="flex items-center gap-3 bg-black/5 p-2 rounded-lg my-1 pr-6">
                            <div className="bg-[#00A884] p-2 rounded-lg text-white">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="font-medium text-sm truncate">{msg.fileName || 'Document'}</span>
                              {msg.fileSize && <span className="text-xs text-zinc-500">{(msg.fileSize / 1024 / 1024).toFixed(2)} MB</span>}
                            </div>
                            <a 
                              href={msg.documentUrl} 
                              download={msg.fileName}
                              className="text-zinc-500 hover:text-zinc-700 bg-white p-2 rounded-full shadow-sm shrink-0"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        ) : msg.type === 'audio' ? (
                          <div className="flex items-center gap-2 my-1 pr-4 min-w-[200px]">
                            <audio 
                              src={msg.audioUrl} 
                              controls 
                              className={cn(
                                "h-10 custom-audio filter", 
                                isMe ? "sepia-[0.3] hue-rotate-[90deg] saturate-[3]" : ""
                                // Note: Styling standard <audio> is limited, but we provide it for basic playback.
                              )}
                            />
                          </div>
                        ) : msg.type === 'image' && msg.imageUrl ? (
                          <div className="flex flex-col gap-1">
                            <div className="mb-1 -mx-1 -mt-1 pt-0.5">
                              <img 
                                src={msg.imageUrl} 
                                alt="Shared image" 
                                className="rounded-lg max-h-64 object-cover"
                                loading="lazy"
                              />
                            </div>
                            {msg.text && <span className="break-words leading-relaxed pr-2 text-[14px]">{msg.text}</span>}
                          </div>
                        ) : (
                          <span className="break-words leading-relaxed pr-2">{msg.text}</span>
                        )}
                      </>
                    )}
                    
                    <div className={cn(
                      "inline-flex items-center justify-end ml-3 mt-1",
                      msg.type === 'image' && !msg.isDeleted ? "absolute bottom-2 right-2 bg-black/30 px-1.5 rounded-full py-0.5 text-white" : "float-right"
                    )}>
                      {msg.timestamp && (
                        <span className={cn(
                          "text-[11px] font-medium leading-none",
                          msg.type === 'image' && !msg.isDeleted ? "text-white" : "text-[#667781]"
                        )}>
                          {format(msg.timestamp.toDate(), 'HH:mm')}
                        </span>
                      )}
                      {renderTicks(msg.status, isMe)}
                    </div>

                    {/* Reactions array floating at bottom */}
                    {hasReactions && (
                      <div className={cn(
                        "absolute -bottom-3 bg-white shadow-sm border border-zinc-100 rounded-full py-0.5 px-1.5 flex gap-0.5 text-sm z-10",
                        isMe ? "right-2" : "left-2"
                      )}>
                        {Object.entries(msg.reactions || {}).slice(0, 3).map(([uid, emoji]) => (
                          <span key={uid}>{emoji}</span>
                        ))}
                        {Object.keys(msg.reactions || {}).length > 3 && (
                          <span className="text-xs text-zinc-500 font-medium ml-1">
                            +{Object.keys(msg.reactions || {}).length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Hover Actions Menu */}
                  {!msg.isDeleted && (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger 
                        className={cn(
                          "opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 h-8 w-8 rounded-full bg-black/5 hover:bg-black/10 shrink-0 inline-flex items-center justify-center outline-none transition-opacity",
                          "absolute top-1/2 -translate-y-1/2",
                          isMe ? "-left-10" : "-right-10"
                        )}
                      >
                        <MoreVertical className="h-4 w-4 text-zinc-600" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isMe ? "end" : "start"} className="w-48 rounded-xl z-50">
                        <DropdownMenuItem onClick={() => setReplyingTo(msg)} className="cursor-pointer">
                          <Reply className="mr-2 h-4 w-4" /> Reply
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <div className="flex justify-between px-2 py-1.5">
                          {['👍', '❤️', '😂', '😮', '😢'].map(emoji => (
                            <button 
                              key={emoji} 
                              onClick={(e) => {
                                // Default button behavior might trigger unwanted propagation, just call handler
                                handleReaction(msg.id, emoji);
                                // Note: we allow Radix to bubble this to close the menu
                              }}
                              className="text-lg hover:scale-125 transition-transform p-1"
                              type="button"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDeleteForMe(msg.id)} className="cursor-pointer">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete for me
                        </DropdownMenuItem>
                        {isMe && (
                          <DropdownMenuItem onClick={() => handleDeleteForEveryone(msg.id)} className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-600">
                            <Ban className="mr-2 h-4 w-4" /> Delete for everyone
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator Bubble */}
          {isSomeoneTyping && (
            <div className="flex self-start items-start animate-in fade-in slide-in-from-bottom-2 duration-300 mb-2">
              <div className="px-3 py-2.5 rounded-xl bg-white shadow-sm rounded-tl-none flex items-center justify-center gap-1.5 h-[38px] w-14">
                <span className="w-1.5 h-1.5 bg-zinc-400/80 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-zinc-400/80 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-zinc-400/80 rounded-full animate-bounce"></span>
              </div>
            </div>
          )}

          <div ref={scrollRef} className="h-2 shrink-0" />
        </div>
      </div>

      {/* Input section with optional reply banner */}
      <div className="border-t border-zinc-200 bg-[#F0F2F5] flex flex-col relative">
        {replyingTo && (
          <div className="bg-[#F0F2F5] px-3 pt-3 pb-1 -mb-1 flex items-center">
            <div className="flex-1 bg-black/5 rounded-xl flex items-center p-2 border-l-4 border-[#00A884]">
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-[13px] font-semibold text-[#00A884] mb-0.5">
                  {replyingTo.senderId === auth.currentUser?.uid ? 'You' : chatName}
                </p>
                <p className="text-[13px] text-zinc-600 truncate">
                  {replyingTo.text || (replyingTo.imageUrl ? '📷 Photo' : replyingTo.audioUrl ? '🎤 Voice message' : replyingTo.documentUrl ? '📎 Document' : 'Message')}
                </p>
              </div>
              {replyingTo.imageUrl && (
                <img src={replyingTo.imageUrl} className="h-10 w-10 object-cover rounded shadow-sm mr-2" alt="reply preview" />
              )}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="ml-2 hover:bg-black/5 rounded-full text-zinc-500 h-8 w-8 shrink-0"
              onClick={() => setReplyingTo(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        <div className="p-3">
          {isRecording ? (
            <div className="flex items-center justify-between max-w-4xl mx-auto w-full h-11 bg-white rounded-lg px-4 shadow-sm border border-[#00A884]/30 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-3 text-red-500">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono text-[15px] font-medium">{formatDuration(recordingDuration)}</span>
              </div>
              <div className="flex items-center gap-1 text-zinc-500 text-sm">
                Recording audio...
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={cancelRecording} 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full shrink-0 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button 
                  onClick={stopRecording} 
                  size="icon" 
                  className="h-8 w-8 bg-[#00A884] hover:bg-[#008f6f] text-white rounded-full shrink-0 shadow-sm"
                >
                  <Send className="h-4 w-4 ml-0.5" />
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="flex gap-2 items-center max-w-4xl mx-auto w-full">
              <input
                type="file"
                accept="*/*"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="text-[#54656F] hover:bg-black/5 rounded-full shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Attach file"
              >
                {isUploading ? <div className="animate-spin h-5 w-5 border-2 border-zinc-500 border-t-transparent rounded-full" /> : <Paperclip className="h-[22px] w-[22px]" />}
              </Button>
              <Input
                value={newMessage}
                onChange={handleInputChange}
                placeholder="Type a message"
                className="flex-1 bg-white border-none focus-visible:ring-0 shadow-sm h-11 rounded-lg px-4 text-[15px]"
                disabled={isUploading}
              />
              {newMessage.trim() || isUploading ? (
                <Button 
                  type="submit" 
                  size="icon" 
                  className="h-11 w-11 rounded-full shrink-0 transition-all bg-[#00A884] hover:bg-[#008f6f] text-white shadow-sm"
                  disabled={isUploading}
                >
                  <Send className="h-5 w-5 ml-1" />
                </Button>
              ) : (
                <Button 
                  type="button" 
                  onClick={startRecording}
                  size="icon" 
                  className="h-11 w-11 rounded-full shrink-0 transition-all bg-transparent text-[#54656F] hover:bg-black/5 hover:text-[#00A884]"
                  title="Voice note"
                >
                  <Mic className="h-[22px] w-[22px]" />
                </Button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
