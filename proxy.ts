import {clerkMiddleware} from '@clerk/nextjs/server';
export default clerkMiddleware();
// Simple matcher supported by Vinext's strict route parser.
export const config={matcher:['/:path*']};
