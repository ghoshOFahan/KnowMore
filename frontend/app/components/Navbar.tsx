"use client";
import Link from "next/link";
import { User, LogOut, LogIn } from "lucide-react";
import { motion } from "framer-motion";
import ThemeToggle from "./ThemeToggle";
import { authClient } from "../auth/authClient";
import { handleGoogleLogin } from "../page";
const { useSession, signOut } = authClient;
const handleLogout = async () => {
  await signOut();
};

export default function Navbar() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  const isAuthenticated = !!session;

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-(--color-line) bg-(--color-bg)/80 backdrop-blur-md flex items-center justify-between px-6 md:px-12"
    >
      {/* Logo */}
      <Link
        href={isAuthenticated ? "/dashboard" : "/"}
        className="flex items-center gap-2 group"
      >
        <span className="font-bold text-xl tracking-tight text-(--color-fg)">
          Know<span className="text-(--color-purple)">More</span>
        </span>
      </Link>

      {/* Right Actions */}
      <div className="flex items-center gap-6">
        <ThemeToggle></ThemeToggle>
        {isAuthenticated ? (
          <div className="flex items-center gap-4">
            <Link
              href="/profile"
              className="hidden md:flex items-center gap-2 text-sm font-medium hover:text-(--color-purple) transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-(--color-line) flex items-center justify-center border border-(--color-line)">
                <User size={16} />
              </div>
              <span>{session?.user?.name}</span>
            </Link>
            <button
              className="text-(--color-comment) hover:text-(--color-red) transition-colors"
              onClick={handleLogout}
            >
              <LogOut size={20} />
            </button>
          </div>
        ) : (
          <button
            className="px-4 py-2 rounded-lg bg-(--color-purple) hover:bg-(--color-pink) text-white text-sm font-medium transition-all"
            onClick={handleGoogleLogin}
          >
            Sign In
          </button>
        )}
      </div>
    </motion.nav>
  );
}
