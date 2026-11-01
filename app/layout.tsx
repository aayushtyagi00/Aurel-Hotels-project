import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"AUREL — Thoughtful stays. Effortless hospitality.",description:"Discover thoughtful rooms, reserve your stay, and enjoy the art of a slower stay at Aurel.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><ClerkProvider localization={{signIn:{start:{title:"Sign in to Aurel"}},signUp:{start:{title:"Create your Aurel account"}}}} appearance={{variables:{colorPrimary:"#294e3e",borderRadius:"1.25rem"}}}>{children}</ClerkProvider></body></html>;}