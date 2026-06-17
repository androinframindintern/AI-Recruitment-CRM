import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './_components/Providers';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
});

export const metadata = {
  title: {
    default: 'AI Recruitment CRM',
    template: '%s | AI Recruitment CRM',
  },
  description: 'Smart hiring automation — AI-powered resume parsing, candidate ranking, interview scheduling, and analytics for modern recruitment teams.',
  keywords: ['recruitment', 'ATS', 'AI hiring', 'resume parsing', 'candidate tracking', 'HR software'],
  authors: [{ name: 'AI Recruitment CRM' }],
  openGraph: {
    title: 'AI Recruitment CRM',
    description: 'Smart hiring automation powered by AI',
    type: 'website',
  },
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020617',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
