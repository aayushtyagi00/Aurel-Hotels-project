import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <div className="auth-page">
      <a className="public-brand" href="/">AUREL<small>THE ART OF A SLOWER STAY</small></a><Suspense>
        <SignIn />
      </Suspense>
    </div>
  );
}
