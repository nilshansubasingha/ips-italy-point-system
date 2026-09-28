import './globals.css';import type {Metadata} from 'next';
export const metadata:Metadata={title:'IPS Overlay Editor',description:'Professional broadcast graphics editor for IPS PRISM'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
