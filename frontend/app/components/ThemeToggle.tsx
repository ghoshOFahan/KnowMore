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
      aria-label={isDracula ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDracula ? "tokyo" : "dracula")}
      className="km-nav-link flex items-center gap-2"
    >
      {isDracula ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
