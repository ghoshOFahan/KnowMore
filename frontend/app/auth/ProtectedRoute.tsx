"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "./authClient";
const { useSession } = authClient;
type Props = {
  children: React.ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <main className="km-loading">
        <span className="km-chain-pin" aria-hidden="true" />
        <p className="km-display">Following your trail…</p>
      </main>
    );
  }

  if (!session) {
    return null;
  }

  return <>{children}</>;
}
