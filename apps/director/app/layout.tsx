import './globals.css';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'IPS Director Studio',description:'Professional live broadcast control room for IPS PRISM'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
