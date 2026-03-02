"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Check, ArrowRight } from "lucide-react";
import ProtectedRoute from "../auth/ProtectedRoute";

const TOPICS = [
  "Space",
  "Philosophy",
  "Nature",
  "Technology",
  "Chaos",
  "Logic",
  "Emotion",
  "History",
  "Future",
  "Art",
  "War",
  "Peace",
  "Biology",
  "Code",
  "Music",
  "Ocean",
  "Mind",
  "Power",
  "Silence",
  "Time",
];

export default function Onboarding() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleTopic = (topic: string) => {
    if (selected.includes(topic)) {
      setSelected(selected.filter((t) => t !== topic));
    } else {
      if (selected.length < 5) {
        setSelected([...selected, topic]);
      }
    }
  };

  const handleSubmit = async () => {
    if (selected.length !== 5) return;
    setIsSubmitting(true);
    console.log(`${process.env.NEXT_PUBLIC_API_URL}`);
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/onboarding`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ topicArray: selected }),
      },
    );

    if (res.ok) {
      router.push("/dashboard");
    } else {
      setIsSubmitting(false);
      console.log("Onboarding request failed!");
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-(--color-bg) flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h1 className="text-3xl font-bold text-(--color-fg) mb-3">
              Calibrate Your Engine
            </h1>
            <p className="text-(--color-comment)">
              Select exactly 5 topics that resonate with you. <br /> These will
              become the anchors of your semantic map.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } },
            }}
          >
            {TOPICS.map((topic) => {
              const isSelected = selected.includes(topic);
              const isFull = selected.length >= 5 && !isSelected;

              return (
                <motion.button
                  key={topic}
                  variants={{
                    hidden: { opacity: 0, scale: 0.8 },
                    visible: { opacity: 1, scale: 1 },
                  }}
                  onClick={() => toggleTopic(topic)}
                  disabled={isFull}
                  className={`
                  relative py-3 px-4 rounded-xl border font-medium text-sm transition-all duration-200
                  ${
                    isSelected
                      ? "bg-(--color-purple) border-(--color-purple) text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                      : "bg-(--color-line)/20 border-(--color-line) text-(--color-comment) hover:bg-(--color-line)/50"
                  }
                  ${isFull ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
                `}
                >
                  <div className="flex items-center justify-between">
                    {topic}
                    {isSelected && <Check size={14} />}
                  </div>
                </motion.button>
              );
            })}
          </motion.div>

          <div className="flex justify-between items-center border-t border-[var(--color-line)] pt-6">
            <span className="text-[var(--color-comment)] text-sm">
              {selected.length} / 5 Selected
            </span>

            <button
              onClick={handleSubmit}
              disabled={selected.length !== 5 || isSubmitting}
              className={`
              flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all
              ${
                selected.length === 5
                  ? "bg-[var(--color-fg)] text-[var(--color-bg)] hover:scale-105"
                  : "bg-[var(--color-line)] text-[var(--color-comment)] cursor-not-allowed"
              }
            `}
            >
              {isSubmitting ? "Calibrating..." : "Initialize Profile"}
              {!isSubmitting && <ArrowRight size={18} />}
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
