"use client";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => setMounted(true), 0);
  }, []);
  if (!mounted) return null;

  const isDracula = theme === "dracula";

  return (
    <button
      aria-label="Switch color theme"
      onClick={() => setTheme(isDracula ? "tokyo" : "dracula")}
      className="km-nav-link flex items-center gap-2"
    >
      {isDracula ? <Moon size={15} /> : <Sun size={15} />}
      <span>Theme</span>
    </button>
  );
}
