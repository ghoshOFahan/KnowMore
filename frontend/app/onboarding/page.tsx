"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw } from "lucide-react";
import ProtectedRoute from "../auth/ProtectedRoute";
import Navbar from "../components/Navbar";

const CUES = ["bridge", "mirror", "seed", "current", "echo"];

export default function Onboarding() {
  const router = useRouter();
  const [words, setWords] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/onboarding/status", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.hasOnboarded) router.push("/dashboard");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  const saveMap = async (associationWords: string[]) => {
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ associations: CUES.map((cue, index) => ({ cue, word: associationWords[index] })) }),
      });
      if (!res.ok) throw new Error("We couldn't read those associations. Please try again.");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const word = answer.trim().toLowerCase();
    if (!/^[a-z]+$/.test(word)) {
      setError("Use one word made of letters, then keep going.");
      return;
    }
    const nextWords = [...words, word];
    setWords(nextWords);
    setAnswer("");
    setError("");
    if (nextWords.length === CUES.length) void saveMap(nextWords);
  };

  const restart = () => {
    setWords([]);
    setAnswer("");
    setError("");
  };

  if (checking) return null;
  const cue = CUES[words.length];

  return (
    <ProtectedRoute>
      <div className="km-page">
        <Navbar />
        <main className="km-onboarding km-discovery">
          <p className="km-kicker">A quick word trail</p>
          <h1>Let your words build your map</h1>
          <p className="km-lede">
            Give the first word that comes to mind for each cue. We’ll use those associations to choose starting topics for your map.
          </p>

          <div className="km-discovery-progress" aria-label={`${words.length} of five associations`}>{CUES.map((item, index) => (
            <span key={item} className={index < words.length ? "complete" : index === words.length ? "current" : ""} />
          ))}</div>

          {cue ? (
            <form className="km-discovery-card" onSubmit={handleAnswer}>
              <span className="km-muted">What word comes to mind when you see</span>
              <strong className="km-discovery-cue">{cue}?</strong>
              <label className="sr-only" htmlFor="association-word">Your one-word association</label>
              <input
                id="association-word"
                autoFocus
                autoComplete="off"
                maxLength={32}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Type the first word that comes to mind"
                className="km-input"
                disabled={isSubmitting}
              />
              {error && <p className="km-error" role="alert">{error}</p>}
              <button className="km-button" type="submit" disabled={!answer.trim() || isSubmitting}>
                {words.length === CUES.length - 1 ? "Build my map" : "Next cue"}
                <ArrowRight size={16} />
              </button>
              {words.length > 0 && <p className="km-muted km-discovery-last">Your trail so far: {words.join(" → ")}</p>}
            </form>
          ) : (
            <div className="km-discovery-card km-discovery-done">
              <span className="km-muted">Your associations</span>
              <div className="km-discovery-trail">{CUES.map((item, index) => <span key={item}>{item} <b>→</b> {words[index]}</span>)}</div>
              <p>{isSubmitting ? "Finding the topics your trail connects with…" : "Your map is ready."}</p>
              {error && <p className="km-error" role="alert">{error}</p>}
              {!isSubmitting && <div className="flex flex-wrap justify-center gap-2">
                {error && <button className="km-button" type="button" onClick={() => void saveMap(words)}>Try saving again</button>}
                <button className="km-button-secondary" type="button" onClick={restart}><RotateCcw size={15} /> Try another trail</button>
              </div>}
            </div>
          )}
          <p className="km-discovery-privacy">Your map is based on your own words and accepted game turns. It helps personalize your KnowMore experience and is private to your account.</p>
        </main>
      </div>
    </ProtectedRoute>
  );
}
