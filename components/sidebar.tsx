'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Calendar, CheckSquare, Settings, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from './auth-provider';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { Button } from './ui/button';
import { Modal } from './ui/modal';

const navItems = [
  { icon: Calendar, href: '/', label: 'Calendar' },
  { icon: CheckSquare, href: '/tasks', label: 'Tasks' },
  { icon: Sparkles, href: '/assistant', label: 'Assistant' },
  { icon: Settings, href: '/settings', label: 'Settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  return (
    <>
      <motion.div 
        layout
        className="h-[clamp(64px,8vh,80px)] bg-bg-secondary/90 backdrop-blur-md border-t border-border-subtle flex items-center justify-around px-2 z-40 sm:w-[70px] sm:h-full sm:flex-col sm:border-t-0 sm:border-r sm:py-4 sm:justify-start order-last sm:order-first sm:overflow-y-auto [webkit-overflow-scrolling:touch]"
      >
        <div className="hidden sm:flex w-[70px] h-[70px] items-center justify-center mb-8">
          <div className="w-10 h-10 bg-accent-blue/20 flex items-center justify-center">
            <span className="text-xl font-bold text-accent-blue tracking-widest">V</span>
          </div>
        </div>

        <nav className="flex-1 w-full flex sm:flex-col items-center justify-around sm:justify-start gap-1 sm:gap-2 relative">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 sm:w-full h-[56px] flex flex-col sm:flex-row items-center justify-center relative group transition-colors",
                  isActive ? "text-accent-primary" : "text-text-secondary hover:text-text-primary sm:hover:bg-surface-hover"
                )}
                title={item.label}
              >
                <item.icon className="w-6 h-6" />
                <span className="text-[clamp(9px,1.5vw,11px)] sm:hidden mt-1">{item.label}</span>
                {isActive && (
                  <>
                    {/* Desktop indicator */}
                    <motion.div
                      layoutId="sidebar-active-indicator"
                      className="hidden sm:block absolute left-0 top-0 bottom-0 w-[3px] bg-accent-primary"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                    {/* Mobile indicator */}
                    <motion.div
                      layoutId="mobile-active-indicator"
                      className="sm:hidden absolute top-0 left-1/4 right-1/4 h-[2px] bg-accent-primary"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-center sm:mt-auto sm:mb-2 px-2">
          <Button
            variant="icon"
            onClick={() => setShowLogoutConfirm(true)}
            className="text-text-secondary hover:text-accent-red hover:bg-accent-red/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-6 h-6" />
          </Button>
        </div>
      </motion.div>

      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Sign Out"
      >
        <div className="space-y-4">
          <p className="text-text-secondary">Are you sure you want to sign out? You will need to sign in again to access your calendar and tasks.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowLogoutConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
