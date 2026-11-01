import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <div className="auth-page">
      <a className="public-brand" href="/">AUREL<small>THE ART OF A SLOWER STAY</small></a><Suspense>
        <SignUp />
      </Suspense>
    </div>
  );
}
