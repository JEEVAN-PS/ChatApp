# QuickChat

A lightweight real-time chat application built with React, TypeScript, and Firebase.

## Project Overview

QuickChat is a modern and simple messaging app designed for fast conversations, real-time updates, and a clean user experience. The project provides a React-based frontend where users can sign in, view chat rooms, and send messages while Firebase handles authentication and persistent chat data.

## Project Structure

```text
src/
├── components/        # Reusable UI components
│   ├── Auth.tsx
│   ├── ChatList.tsx
│   ├── ChatRoom.tsx
│   └── NewChatDialog.tsx
├── lib/               # Firebase and utility helpers
├── types.ts           # App data types
├── App.tsx            # Main application component
└── main.tsx           # Entry point
```

## Tech Stack

### Frontend
- React.js
- TypeScript
- Vite
- Tailwind-style UI components
- Firebase SDK

### Backend / Services
- Firebase Authentication
- Firestore Database
- Real-time data syncing

## Getting Started

### Prerequisites
- Node.js
- npm

### Installation
```bash
npm install
```

### Run the app
```bash
npm run dev
```

Runs on: http://localhost:3000

## Key Features
- User authentication
- Create and manage chat rooms
- Send and receive real-time messages
- Persistent chat history
- Responsive and modern UI

## Overview

QuickChat provides a simple yet scalable chat experience for learning, prototyping, or building lightweight messaging applications. It combines a fast React frontend with Firebase services to deliver a smooth and interactive real-time experience.
