import './globals.css';
import type {Metadata} from 'next';

export const metadata:Metadata={
  title:'IPS PRISM Control Room',
  description:'Director, graphics control and live broadcast operations for IPS PRISM'
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
