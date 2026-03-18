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
          <div className="flex flex-col sm:flex-row h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col sm:ml-0">
              <Titlebar />
              <main className="flex-1 overflow-y-auto p-[var(--space-base)] pb-[clamp(80px,10vh,100px)] sm:pb-[var(--space-base)]">
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
