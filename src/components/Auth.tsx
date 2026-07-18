import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { MessageSquare, Mail } from 'lucide-react';

export default function Auth() {
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Check if user exists in Firestore, if not create profile
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          lastSeen: serverTimestamp(),
          isOnline: true
        });
      } else {
        await setDoc(userRef, {
          isOnline: true,
          lastSeen: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-zinc-200 relative">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-zinc-900 w-12 h-12 rounded-2xl flex items-center justify-center mb-2">
            <MessageSquare className="text-white w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Welcome to QuickChat</CardTitle>
          <CardDescription>Connect with friends and family in real-time</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button 
            onClick={handleLogin} 
            className="w-full h-12 text-base font-medium transition-all hover:scale-[1.02]"
          >
            <Mail className="w-5 h-5 mr-2" />
            Sign in with Google
          </Button>

          <p className="text-xs text-center text-zinc-500 mt-4">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
