"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { authClient } from "../auth/authClient";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const { useSession, signOut } = authClient;

export default function Navbar() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const authenticated = !!session;

  const login = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/onboarding`,
      errorCallbackURL: `${window.location.origin}/?error=google`,
    });
  };

  return (
    <header className={`km-navbar ${menuOpen ? "menu-open" : ""}`}>
      <Link className="km-logo" href={authenticated ? "/dashboard" : "/"}>
        <span aria-hidden="true" className="km-logo-mark" />
        <span>KnowMore</span>
      </Link>
      <button type="button" className="km-menu-toggle" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="km-main-navigation" onClick={() => setMenuOpen((open) => !open)}>
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav id="km-main-navigation" aria-label="Main navigation" className="km-nav-actions">
        {authenticated && (
          <Link onClick={() => setMenuOpen(false)} className="km-nav-link" aria-current={pathname === "/dashboard" ? "page" : undefined} href="/dashboard">
            Dashboard
          </Link>
        )}
        {authenticated && (
          <Link onClick={() => setMenuOpen(false)} className="km-nav-link" aria-current={pathname === "/profile" ? "page" : undefined} href="/profile">
            Profile
          </Link>
        )}
        <Link onClick={() => setMenuOpen(false)} className="km-nav-link" aria-current={pathname === "/about" ? "page" : undefined} href="/about">
          How it works
        </Link>
        {!isPending && (authenticated ? (
          <button className="km-nav-link" onClick={() => { setMenuOpen(false); void signOut(); }}>
            Sign out
          </button>
        ) : (
          <button className="km-nav-link" onClick={() => { setMenuOpen(false); void login(); }}>
            Sign in
          </button>
        ))}
        <ThemeToggle />
      </nav>
    </header>
  );
}
