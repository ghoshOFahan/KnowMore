"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { authClient } from "../auth/authClient";

const { useSession, signOut } = authClient;

export default function Navbar() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const authenticated = !!session;

  const login = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/onboarding`,
      errorCallbackURL: `${window.location.origin}/?error=google`,
    });
  };

  return (
    <header className="km-navbar">
      <Link className="km-logo" href={authenticated ? "/dashboard" : "/"}>
        <span aria-hidden="true" className="km-logo-mark" />
        <span>KnowMore</span>
      </Link>
      <nav aria-label="Main navigation" className="km-nav-actions">
        <Link className="km-nav-link" aria-current={pathname === "/about" ? "page" : undefined} href="/about">
          How it works
        </Link>
        {authenticated && (
          <Link className="km-nav-link" aria-current={pathname === "/dashboard" ? "page" : undefined} href="/dashboard">
            Dashboard
          </Link>
        )}
        {!isPending && (authenticated ? (
          <button className="km-nav-link" onClick={() => signOut()}>
            Sign out
          </button>
        ) : (
          <button className="km-nav-link" onClick={login}>
            Sign in
          </button>
        ))}
        <ThemeToggle />
      </nav>
    </header>
  );
}
