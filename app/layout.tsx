import type {Metadata, Viewport} from 'next';
import { Lexend } from 'next/font/google';
import './globals.css'; // Global styles
import { AuthProvider } from '@/components/auth-provider';
import { Sidebar } from '@/components/sidebar';
import { Titlebar } from '@/components/titlebar';
import { NotificationManager } from '@/components/notification-manager';
import { ClientLayout } from '@/components/client-layout';

const lexend = Lexend({
  subsets: ['latin'],
  variable: '--font-lexend',
});

export const metadata: Metadata = {
  title: 'Vermix Calendar',
  description: 'A smart calendar and task tracker.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Vermix',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={lexend.variable}>
      <body suppressHydrationWarning className="bg-bg-primary text-text-primary min-h-screen flex flex-col">
        <AuthProvider>
          <NotificationManager />
          <div className="flex flex-col sm:flex-row h-[100dvh] overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <Titlebar />
              <main className="flex-1 overflow-y-auto overscroll-contain sm:p-[var(--space-base)] p-0 [webkit-overflow-scrolling:touch]">
                <ClientLayout>
                  {children}
                </ClientLayout>
              </main>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
