"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import { authClient } from "../auth/authClient";
import { ArrowRight } from "lucide-react";

const steps = [
  ["Choose five topic anchors", "Pick topics like Space, Music, or Biology. They become the corners of your personal map."],
  ["Play the word chain", "Take turns adding a word connected to the last one. A trail can wander anywhere."],
  ["Let the judge check each link", "The AI looks at meaning, not spelling. Break the connection or repeat a word and you lose a life."],
  ["Watch your map evolve", "Words that land near an anchor add to its score. Play more and your semantic fingerprint takes shape."],
];

const faqs = [
  ["What makes two words related?", "KnowMore compares semantic meaning. ‘Ocean’ and ‘depth’ connect closely; unrelated words are much farther apart."],
  ["What happens when I lose a life?", "You can keep playing while you have lives left. A broken connection or a repeated word costs one life."],
  ["Can I play with a friend?", "Yes. Create a room and share its code, or join a room with a code from a friend."],
];

export default function AboutPage() {
  const startGoogle = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/onboarding`,
      errorCallbackURL: `${window.location.origin}/?error=google`,
    });
  };

  return (
    <div className="km-page">
      <Navbar />
      <main className="km-content km-about">
        <p className="km-kicker">How KnowMore works</p>
        <div className="km-about-intro">
          <h1>Every word draws a line.</h1>
          <p className="km-lede">Your choices make a trail through ideas. Over time, that trail becomes a map of how your mind connects them.</p>
        </div>

        <ol className="km-steps">
          {steps.map(([title, text], index) => (
            <li className="km-step" key={title}>
              <p className="km-kicker">Step {String(index + 1).padStart(2, "0")}</p>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>

        <section className="km-section-card">
          <p className="km-kicker">The idea behind the map</p>
          <h2>Semantic gravity</h2>
          <p className="km-muted">Think of your five anchors as places in idea-space. Each word you play is compared with those anchors. The closest one gains points, and the radar shows which ideas pull you in most often.</p>
        </section>

        <section aria-labelledby="faq-heading" className="my-12">
          <h2 id="faq-heading">A few questions</h2>
          <div className="mt-5">
            {faqs.map(([question, answer]) => (
              <article className="km-faq" key={question}>
                <h3>{question}</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="km-section-card">
          <h2>Ready to start a trail?</h2>
          <p className="km-muted">Pick your anchors and see where your next word takes you.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="km-button-gold" onClick={startGoogle}>Continue with Google <ArrowRight size={16} /></button>
            <Link className="km-button-secondary" href="/">Back home</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
