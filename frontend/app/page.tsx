"use client";
import Navbar from "./components/Navbar";
import { motion } from "framer-motion";
import { ArrowRight, Brain, Zap, Fingerprint } from "lucide-react";
import Link from "next/link";
import { authClient } from "./auth/authClient";
const handleGoogleLogin = async () => {
  await authClient.signIn.social({
    provider: "google",
    callbackURL: `${window.location.origin}/onboarding`,
    errorCallbackURL: `${window.location.origin}/login?error=google`,
  });
};
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-(--color-bg) text-(--color-fg) overflow-hidden">
      <Navbar />

      {/* Hero Section */}
      <main className="relative pt-32 pb-20 px-6">
        {/* Background Blobs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-(--color-purple)/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-(--color-pink)/20 rounded-full blur-[120px]" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full border border-(--color-purple)/30 bg-(--color-purple)/10 text-(--color-purple) text-sm font-medium mb-6">
              V 1.0 // Public Beta
            </span>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6 bg-clip-text text-transparent bg-linear-to-r from-white via-white to-(--color-comment)">
              Discover Your <br />
              <span className="text-transparent bg-clip-text bg-linear-to-r from-(--color-purple) to-(--color-pink)">
                Semantic Fingerprint
              </span>
            </h1>
            <p className="text-lg md:text-xl text-(--color-comment) mb-10 max-w-2xl mx-auto leading-relaxed">
              A real-time word association game that maps your cognitive
              patterns. Are you an abstract thinker, a risk-taker, or a
              logician? Play to find out.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleGoogleLogin} // Or /dashboard if doing mocked auth
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-(--color-fg) text-(--color-bg) font-bold text-lg hover:scale-105 transition-transform flex items-center justify-center gap-2"
              >
                Sign up with Google <ArrowRight size={20} />
              </button>
              <Link
                href="/about"
                className="w-full sm:w-auto px-8 py-4 rounded-xl border border-(--color-line) text-(--color-fg) font-medium hover:bg-(--color-line)/50 transition-colors"
              >
                How it works
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Features Grid */}
        <div className="max-w-6xl mx-auto mt-32 grid md:grid-cols-3 gap-8">
          {[
            {
              icon: <Brain className="text-(--color-purple)" size={32} />,
              title: "Cognitive Mapping",
              desc: "We analyze your semantic jumps to build a real-time radar chart of your thinking style.",
            },
            {
              icon: <Fingerprint className="text-(--color-pink)" size={32} />,
              title: "Unique Identity",
              desc: "No two players are alike. Your word choices generate a unique vector signature.",
            },
            {
              icon: <Zap className="text-(--color-green)" size={32} />,
              title: "AI Analysis",
              desc: "Powered by Azure OpenAI to judge relevance and calculate risk in milliseconds.",
            },
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-8 rounded-2xl bg-(--color-line)/10 border border-(--color-line) backdrop-blur-sm"
            >
              <div className="mb-4 p-3 rounded-lg bg-(--color-bg) inline-block border border-(--color-line)">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-2 text-(--color-fg)">
                {feature.title}
              </h3>
              <p className="text-(--color-comment)">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
