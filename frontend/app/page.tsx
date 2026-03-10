"use client";
import Navbar from "./components/Navbar";
import { motion } from "framer-motion";
import { ArrowRight, Brain, Zap, Fingerprint } from "lucide-react";
import Link from "next/link";
import { authClient } from "./auth/authClient";

export const handleGoogleLogin = async () => {
  await authClient.signIn.social({
    provider: "google",
    callbackURL: `https://knowmore.ahanghosh.site/onboarding`,
    errorCallbackURL: `https://knowmore.ahanghosh.site/login?error=google`,
  });
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] overflow-hidden">
      <Navbar />

      <main className="relative pt-32 pb-20 px-6">
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background: [
              "radial-gradient(ellipse 70% 55% at 50% 38%, var(--color-bg) 30%, transparent 100%)",
            ].join(", "),
          }}
        />

        <div
          className="pointer-events-none absolute top-10 left-[20%] w-[500px] h-[500px] rounded-full blur-[160px] z-0"
          style={{ background: "var(--color-purple)", opacity: 0.13 }}
        />
        <div
          className="pointer-events-none absolute top-32 right-[15%] w-[400px] h-[400px] rounded-full blur-[140px] z-0"
          style={{ background: "var(--color-pink)", opacity: 0.11 }}
        />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
          >
            <h1 className="font-bold leading-[1.1] tracking-tight mb-6">
              <span
                className="block text-5xl md:text-7xl"
                style={{ color: "var(--color-fg)" }}
              >
                Discover Your
              </span>
              <span
                className="block text-5xl md:text-7xl mt-1 pb-4"
                style={{
                  backgroundImage:
                    "linear-gradient(120deg, var(--color-purple) 0%, var(--color-pink) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Semantic Fingerprint
              </span>
            </h1>

            <p
              className="text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
              style={{ color: "var(--color-comment)" }}
            >
              A real-time word association game that maps your cognitive
              patterns. Are you an abstract thinker, a risk-taker, or a
              logician?{" "}
              <em style={{ color: "var(--color-fg)", fontStyle: "italic" }}>
                Play to find out.
              </em>
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleGoogleLogin}
                className="group w-full sm:w-auto px-8 py-4 rounded-xl font-bold text-lg hover:scale-[1.03] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 shadow-lg"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-purple), var(--color-pink))",
                  color: "#fff",
                }}
              >
                Sign up with Google
                <ArrowRight
                  size={20}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </button>
              <Link
                href="/about"
                className="w-full sm:w-auto px-8 py-4 rounded-xl border font-medium hover:bg-[var(--color-line)] transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  color: "var(--color-fg)",
                }}
              >
                How it works
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.6 }}
            className="mt-20 flex items-center justify-center gap-2 flex-wrap select-none"
          >
            {[
              { t: "ocean", valid: true },
              { t: "→", arrow: true },
              { t: "depth", valid: true },
              { t: "→", arrow: true },
              { t: "pressure", valid: true },
              { t: "→", arrow: true },
              { t: "diamond", valid: true },
              { t: "→", arrow: true },
              { t: "bone", valid: false },
              { t: "→", arrow: true },
              { t: "???", cta: true },
            ].map((item, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + i * 0.07 }}
                className={
                  item.arrow
                    ? "text-[var(--color-comment)] text-sm"
                    : item.cta
                      ? "px-3 py-1.5 rounded-lg text-xs font-mono font-bold border-2 border-dashed"
                      : item.valid === false
                        ? "px-3 py-1.5 rounded-lg text-xs font-mono font-medium line-through"
                        : "px-3 py-1.5 rounded-lg text-xs font-mono font-medium"
                }
                style={
                  item.arrow
                    ? {}
                    : item.cta
                      ? {
                          borderColor: "var(--color-purple)",
                          color: "var(--color-purple)",
                        }
                      : item.valid === false
                        ? {
                            background:
                              "color-mix(in srgb, var(--color-red) 15%, transparent)",
                            border:
                              "1px solid color-mix(in srgb, var(--color-red) 40%, transparent)",
                            color: "var(--color-red)",
                          }
                        : {
                            background: "var(--color-line)",
                            border: "1px solid var(--color-line)",
                            color: "var(--color-fg)",
                          }
                }
              >
                {item.t}
              </motion.span>
            ))}
          </motion.div>
          <p
            className="mt-3 text-xs font-mono"
            style={{ color: "var(--color-comment)" }}
          >
            strikethrough = eliminated · AI judges every word in real-time
          </p>
        </div>

        <div className="max-w-6xl mx-auto mt-36 grid md:grid-cols-3 gap-6 relative z-10">
          {[
            {
              icon: <Brain size={28} />,
              accent: "--color-purple",
              title: "Cognitive Mapping",
              desc: "Every word you play is embedded into a 768-dimensional vector. We compare it against your topic anchors to map your mind.",
            },
            {
              icon: <Fingerprint size={28} />,
              accent: "--color-pink",
              title: "Unique Identity",
              desc: "No two players think alike. Your semantic jumps generate a one-of-a-kind fingerprint that evolves every match.",
            },
            {
              icon: <Zap size={28} />,
              accent: "--color-green",
              title: "AI Judge",
              desc: "Powered by Gemini embeddings. Cosine similarity decides relevance — not rules. Creative leaps are rewarded.",
            },
          ].map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
              className="group relative p-8 rounded-2xl border overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{
                background:
                  "color-mix(in srgb, var(--color-line) 30%, var(--color-bg))",
                borderColor: "var(--color-line)",
              }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at 30% 20%, color-mix(in srgb, var(${f.accent}) 20%, transparent), transparent 65%)`,
                }}
              />
              <div
                className="mb-4 w-12 h-12 rounded-xl flex items-center justify-center border relative z-10"
                style={{
                  background: "var(--color-bg)",
                  borderColor: "var(--color-line)",
                  color: `var(${f.accent})`,
                }}
              >
                {f.icon}
              </div>
              <h3
                className="text-lg font-bold mb-2 relative z-10"
                style={{ color: "var(--color-fg)" }}
              >
                {f.title}
              </h3>
              <p
                className="text-sm leading-relaxed relative z-10"
                style={{ color: "var(--color-comment)" }}
              >
                {f.desc}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="max-w-5xl mx-auto mt-36 relative z-10">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-3xl font-bold mb-16"
            style={{ color: "var(--color-fg)" }}
          >
            Three rounds. One identity.
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Pick your 5 anchors",
                desc: "On sign-up, choose 5 topics you care about. They define your cognitive universe.",
              },
              {
                step: "02",
                title: "Play the word chain",
                desc: "Each player submits a word related to the previous one. The AI judge eliminates the unrelated.",
              },
              {
                step: "03",
                title: "Watch your radar evolve",
                desc: "Every game updates your Cognitive Radar. Your semantic gravity shifts with each match.",
              },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="flex gap-5"
              >
                <span
                  className="text-4xl font-black leading-none shrink-0 font-mono"
                  style={{
                    color: `color-mix(in srgb, var(--color-purple) 60%, var(--color-line))`,
                  }}
                >
                  {s.step}
                </span>
                <div>
                  <h3
                    className="font-bold text-lg mb-1"
                    style={{ color: "var(--color-fg)" }}
                  >
                    {s.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--color-comment)" }}
                  >
                    {s.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto mt-32 p-12 rounded-3xl border text-center relative overflow-hidden z-10"
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
                "radial-gradient(ellipse at 50% 110%, color-mix(in srgb, var(--color-purple) 25%, transparent), transparent 65%)",
            }}
          />
          <h2
            className="text-3xl font-bold mb-3 relative z-10"
            style={{ color: "var(--color-fg)" }}
          >
            Ready to map your mind?
          </h2>
          <p
            className="mb-8 relative z-10"
            style={{ color: "var(--color-comment)" }}
          >
            Your first game takes 5 minutes. Your fingerprint lasts forever.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="px-10 py-3.5 rounded-xl font-bold text-lg hover:scale-105 transition-transform relative z-10 shadow-lg"
            style={{
              background:
                "linear-gradient(135deg, var(--color-purple), var(--color-pink))",
              color: "#fff",
            }}
          >
            Start Playing Free
          </button>
        </motion.div>
      </main>
    </div>
  );
}
