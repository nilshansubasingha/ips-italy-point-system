import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'IPS PRISM Overlay', description: 'IPS broadcast overlay shell' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
