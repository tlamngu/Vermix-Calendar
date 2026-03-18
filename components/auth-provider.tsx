'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Auth form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        // Optional: show a message that they need to verify their email
        // if email confirmations are enabled in Supabase.
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error('Auth failed:', error);
      setAuthError(error.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg-primary text-text-primary">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center gap-6"
        >
          <div className="w-16 h-16 bg-accent-blue/10 flex items-center justify-center relative">
            <span className="text-2xl font-bold text-accent-blue tracking-widest z-10">V</span>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border-2 border-accent-blue/20 border-t-accent-blue"
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-xl font-medium tracking-tight">Vermix Calendar</h1>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                  className="w-1.5 h-1.5 bg-accent-blue rounded-full"
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg-primary text-text-primary">
        <div className="w-full max-w-md p-8 bg-bg-secondary border border-border-subtle flex flex-col items-center">
          <div className="w-16 h-16 bg-accent-blue/20 flex items-center justify-center mb-6">
            <span className="text-2xl font-bold text-accent-blue tracking-widest">V</span>
          </div>
          <h1 className="text-2xl font-semibold mb-2">Vermix Calendar</h1>
          <p className="text-text-secondary text-sm mb-8 text-center">
            {isSignUp ? 'Create an account to get started.' : 'Sign in to access your calendar.'}
          </p>
          
          <form onSubmit={handleAuth} className="w-full space-y-4">
            {authError && (
              <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded">
                {authError}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-10 bg-bg-primary border border-border-subtle px-3 text-sm focus:outline-none focus:border-accent-blue transition-colors"
                placeholder="you@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-10 bg-bg-primary border border-border-subtle px-3 text-sm focus:outline-none focus:border-accent-blue transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10 mt-4 bg-accent-primary text-bg-primary font-medium text-sm hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                isSignUp ? 'Sign Up' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-sm text-text-secondary">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setAuthError(null);
              }}
              className="text-accent-blue hover:underline"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}
