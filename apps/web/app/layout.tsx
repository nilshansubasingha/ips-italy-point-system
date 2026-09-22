import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'IPS — Italy Point System',
  description: 'The connected digital ecosystem for softball cricket in Italy',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
