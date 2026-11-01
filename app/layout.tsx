import type { Metadata } from 'next';import './globals.css';
export const metadata:Metadata={title:'AUREL — Thoughtful stays',description:'Discover rooms, compare your dates, and enjoy a slower stay.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
