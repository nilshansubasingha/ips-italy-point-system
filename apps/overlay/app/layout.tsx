import './globals.css';
import type {Metadata} from 'next';

export const metadata:Metadata={
  title:'IPS PRISM Program Renderer',
  description:'Transparent 1920x1080 IPS broadcast Program output'
};

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  return <html lang="en"><body>{children}</body></html>;
}
