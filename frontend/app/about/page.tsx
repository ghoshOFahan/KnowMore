"use client";
import Navbar from "../components/Navbar";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Fingerprint,
  Zap,
  Target,
  GitBranch,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { authClient } from "../auth/authClient";

const handleGoogleLogin = async () => {
  await authClient.signIn.social({
    provider: "google",
    callbackURL: `${window.location.origin}/onboarding`,
    errorCallbackURL: `${window.location.origin}/login?error=google`,
  });
};

const steps = [
  {
    icon: <Target size={22} />,
    accent: "--color-purple",
    title: "Choose 5 Topic Anchors",
    body: "When you sign up, you pick 5 topics that define your cognitive universe — things like Space, Music, History, or Biology. These become the axes of your personal Cognitive Radar.",
  },
  {
    icon: <GitBranch size={22} />,
    accent: "--color-cyan",
    title: "Play the Word Chain",
    body: "In each match, players take turns submitting a word related to the previous one. No rules about what's related — that's the AI's job. The chain can go anywhere.",
  },
  {
    icon: <Zap size={22} />,
    accent: "--color-pink",
    title: "AI Judges Every Word",
    body: "Powered by Gemini's text-embedding-001 model. Each word is converted to a 768-dimensional vector. Cosine similarity determines if it's related enough. Below 0.65 — you're out.",
  },
  {
    icon: <BarChart3 size={22} />,
    accent: "--color-green",
    title: "Your Radar Evolves",
    body: "After each game, our BullMQ worker compares every word in the chain against your 5 anchor vectors. Words that land near an anchor add to your score for that topic. Play more, reveal more.",
  },
];

const faqs = [
  {
    q: "What makes two words 'related'?",
    a: "We use Gemini's semantic embeddings. Words close in meaning share similar vector directions in 768-dimensional space. 'ocean' and 'depth' are close. 'ocean' and 'carburetor' are not. It's meaning, not spelling.",
  },
  {
    q: "Can I game the system by always playing safe words?",
    a: "You can, but your radar won't grow. Safe, generic words don't pull strongly toward any anchor. Bold, specific associations are what shift your fingerprint.",
  },
  {
    q: "What happens when I'm eliminated?",
    a: "Your words still count toward your analytics. Being eliminated just means one of your words didn't clear the similarity threshold — it happens to everyone.",
  },
  {
    q: "How many players per game?",
    a: "Up to 4 players per room. Last player standing wins. You can also play solo against an AI opponent.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] overflow-hidden">
      <Navbar />

      {/* Same pattern vignette as landing page */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 38%, var(--color-bg) 30%, transparent 100%)",
        }}
      />

      {/* Glow blobs */}
      <div
        className="pointer-events-none fixed top-0 right-[10%] w-[600px] h-[400px] rounded-full blur-[180px] z-0"
        style={{ background: "var(--color-purple)", opacity: 0.09 }}
      />
      <div
        className="pointer-events-none fixed bottom-0 left-[5%] w-[500px] h-[400px] rounded-full blur-[160px] z-0"
        style={{ background: "var(--color-cyan)", opacity: 0.07 }}
      />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-24 text-center"
        >
          <p
            className="text-2xl max-w-xl mx-auto leading-relaxed"
            style={{ color: "var(--color-comment)" }}
          >
            Every word you play is a data point. Over time, we build a
            high-dimensional map of how your mind connects ideas. This is how it
            works.
          </p>
        </motion.div>

        <div className="relative mb-32">
          <div
            className="absolute left-[22px] top-8 bottom-8 w-px hidden md:block"
            style={{
              background:
                "linear-gradient(to bottom, var(--color-purple), var(--color-pink), var(--color-cyan))",
              opacity: 0.3,
            }}
          />

          <div className="space-y-12">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-6 group"
              >
                <div
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border relative z-10 transition-transform group-hover:scale-110"
                  style={{
                    background: `color-mix(in srgb, var(${step.accent}) 15%, var(--color-bg))`,
                    borderColor: `color-mix(in srgb, var(${step.accent}) 40%, var(--color-line))`,
                    color: `var(${step.accent})`,
                  }}
                >
                  {step.icon}
                </div>

                <div className="pt-1.5">
                  <div
                    className="text-xs font-mono mb-1"
                    style={{ color: "var(--color-comment)" }}
                  >
                    Step {String(i + 1).padStart(2, "0")}
                  </div>
                  <h3
                    className="text-xl font-bold mb-2"
                    style={{ color: "var(--color-fg)" }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed max-w-2xl"
                    style={{ color: "var(--color-comment)" }}
                  >
                    {step.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div
          className="h-px w-full mb-24"
          style={{
            background:
              "linear-gradient(to right, transparent, var(--color-line), transparent)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-32 p-10 rounded-3xl border relative overflow-hidden"
          style={{
            borderColor: "var(--color-line)",
            background:
              "color-mix(in srgb, var(--color-line) 20%, var(--color-bg))",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 0% 50%, color-mix(in srgb, var(--color-purple) 18%, transparent), transparent 60%)",
            }}
          />
          <div className="flex items-start gap-4 mb-6 relative z-10">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
              style={{
                background:
                  "color-mix(in srgb, var(--color-purple) 15%, var(--color-bg))",
                borderColor:
                  "color-mix(in srgb, var(--color-purple) 40%, var(--color-line))",
                color: "var(--color-purple)",
              }}
            >
              <Brain size={20} />
            </div>
            <h2
              className="text-2xl font-bold pt-1"
              style={{ color: "var(--color-fg)" }}
            >
              The Semantic Gravity model
            </h2>
          </div>
          <p
            className="text-sm leading-relaxed mb-4 relative z-10 max-w-3xl"
            style={{ color: "var(--color-comment)" }}
          >
            Think of your 5 topic anchors as gravitational wells in semantic
            space. Every word you play gets embedded and compared to all 5
            wells. The closest one gains points equal to{" "}
            <code
              className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{
                background: "var(--color-line)",
                color: "var(--color-fg)",
              }}
            >
              cosine_similarity × 10
            </code>
            , but only if similarity exceeds 0.35.
          </p>
          <p
            className="text-sm leading-relaxed relative z-10 max-w-3xl"
            style={{ color: "var(--color-comment)" }}
          >
            Over dozens of games, the accumulated scores build your Cognitive
            Radar — a personal map of where your thinking naturally orbits.
            Players who frequently bridge distant concepts show high scores
            across multiple anchors. Specialists show one dominant spike.
          </p>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-24"
        >
          <h2
            className="text-2xl font-bold mb-10 text-center"
            style={{ color: "var(--color-fg)" }}
          >
            Common questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="p-6 rounded-2xl border"
                style={{
                  borderColor: "var(--color-line)",
                  background:
                    "color-mix(in srgb, var(--color-line) 15%, var(--color-bg))",
                }}
              >
                <h3
                  className="font-semibold mb-2"
                  style={{ color: "var(--color-fg)" }}
                >
                  {faq.q}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-comment)" }}
                >
                  {faq.a}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2
            className="text-3xl font-bold mb-4"
            style={{ color: "var(--color-fg)" }}
          >
            Sound interesting?
          </h2>
          <p className="mb-8" style={{ color: "var(--color-comment)" }}>
            Your semantic fingerprint is waiting.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={handleGoogleLogin}
              className="group px-8 py-3.5 rounded-xl font-bold text-lg hover:scale-105 transition-transform flex items-center gap-2 shadow-lg"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-purple), var(--color-pink))",
                color: "#fff",
              }}
            >
              Get Started Free
              <ArrowRight
                size={18}
                className="group-hover:translate-x-1 transition-transform"
              />
            </button>
            <Link
              href="/"
              className="px-8 py-3.5 rounded-xl border font-medium transition-colors hover:bg-[var(--color-line)]"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-fg)",
              }}
            >
              Back to Home
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
