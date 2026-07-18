export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string;
  photoURL: string | null;
  lastSeen?: any;
  isOnline?: boolean;
}

export interface Chat {
  id: string;
  type: 'private' | 'group';
  name?: string;
  participants: string[];
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: any;
  };
  unreadCount?: Record<string, number>;
  typing?: Record<string, boolean>;
  createdAt: any;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: any;
  type: 'text' | 'image' | 'audio' | 'document';
  status?: 'sent' | 'delivered' | 'read';
  imageUrl?: string;
  audioUrl?: string;
  documentUrl?: string;
  fileName?: string;
  fileSize?: number;
  replyTo?: {
    id: string;
    text: string;
    senderName?: string;
  };
  reactions?: Record<string, string>;
  isDeleted?: boolean;
  deletedFor?: string[];
}
