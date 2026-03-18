'use client';

import { useAuth } from './auth-provider';
import { motion } from 'motion/react';

export function Titlebar() {
  const { user } = useAuth();

  return (
    <motion.div 
      layout
      className="h-[clamp(44px,6vh,56px)] sm:ml-[70px] bg-bg-primary border-b border-border-subtle flex items-center justify-between px-[var(--space-base)] sticky top-0 z-30"
    >
      <div className="text-[10px] sm:text-xs font-medium text-text-secondary tracking-wider uppercase">
        Vermix Calendar
      </div>
      <div className="flex items-center gap-4">
        <div className="text-[10px] sm:text-xs text-text-tertiary">
          {user?.email}
        </div>
        {user?.user_metadata?.avatar_url && (
          <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-6 h-6 object-cover rounded-full" />
        )}
      </div>
    </motion.div>
  );
}
