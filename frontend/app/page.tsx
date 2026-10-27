"use client";

import Link from "next/link";
import Navbar from "./components/Navbar";
import HangingWordChain from "./components/HangingWordChain";
import { authClient } from "./auth/authClient";
import { ArrowRight } from "lucide-react";

export const handleGoogleLogin = async () => {
  await authClient.signIn.social({
    provider: "google",
    callbackURL: `${window.location.origin}/onboarding`,
    errorCallbackURL: `${window.location.origin}/?error=google`,
  });
};

export default function LandingPage() {
  const { data: session } = authClient.useSession();

  return (
    <div className="km-page">
      <Navbar />
      <main className="km-content" style={{ paddingTop: 0 }}>
        <section className="km-home-hero">
          <div>
            <p className="km-kicker">A social word-chain game</p>
            <h1>Discover Your <em>Semantic Fingerprint</em></h1>
            <p className="km-lede">A word chain game that maps how you think.</p>
            <div className="flex flex-wrap gap-3">
              {session ? (
                <Link className="km-button-gold" href="/dashboard">Go to your dashboard <ArrowRight size={16} /></Link>
              ) : (
                <button className="km-button-gold" onClick={handleGoogleLogin}>Sign up with Google <ArrowRight size={16} /></button>
              )}
              <Link className="km-button-secondary" href="/about">How it works</Link>
            </div>
          </div>

          <HangingWordChain />
        </section>

      </main>
    </div>
  );
}
