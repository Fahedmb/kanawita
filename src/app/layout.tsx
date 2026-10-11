import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kanawita (كنويطة) — TND Personal Finance & Friend Influence Tracker',
  description:
    '2-second TND speed-pad logger, unified UIB/Savings/D17 balance pool, and hybrid Friend Influence analytics. 100% offline-first on your phone with background MongoDB sync.',
  applicationName: 'Kanawita',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kanawita',
  },
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#08090C',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="font-sans antialiased bg-[#08090C] text-zinc-100 selection:bg-emerald-500/30 selection:text-emerald-200 min-h-dvh">
        {children}
      </body>
    </html>
  );
}
