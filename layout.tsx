import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { ConvexClientProvider } from './convex-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Green Felt — Play a round',
  description: 'Play a quick card game against the table or host a private, live Green Felt room with friends. Match suits, outplay the table, and empty your hand first.',
  applicationName: 'Green Felt',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Green Felt' },
  formatDetection: { telephone: false },
  manifest: '/manifest.webmanifest',
  generator: 'v0.app',
  icons: {
    icon: '/green-felt-icon.png',
    apple: '/green-felt-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#09120e',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
