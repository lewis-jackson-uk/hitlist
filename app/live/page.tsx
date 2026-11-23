"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BriefView } from "@/components/BriefView";
import { Footer } from "@/components/Footer";
import type { Brief } from "@/lib/types";

type State = { kind: "loading" } | { kind: "ready"; brief: Brief } | { kind: "signed_out" } | { kind: "error"; message: string };

export default function Live() {
  const [state, setState] = useState<State>({ kind: "loading" });

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/brief", { cache: "no-store" });
      if (res.status === 401) return setState({ kind: "signed_out" });
      const body = await res.json();
      if (!res.ok) return setState({ kind: "error", message: body.message ?? "Couldn't load your inbox." });
      setState({ kind: "ready", brief: body });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Check your connection and refresh." });
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="page">
      <header className="mast">
        <h1 className="wordmark">HitList</h1>
        <div className="modes">
          {state.kind === "ready" && (
            <>
              <button className="btn" onClick={load}>Refresh</button>
              <form action="/api/auth/logout" method="post">
                <button className="btn ghost" type="submit">Disconnect</button>
              </form>
              <span className="note">
                {state.brief.account}. {state.brief.usedClaude ? "Urgency and replies by Claude." : "Rule-based urgency (no Claude key set)."}
              </span>
            </>
          )}
          <Link className="note" href="/">See the sample inbox</Link>
        </div>
      </header>

      {state.kind === "loading" && (
        <div className="loading" aria-busy="true" aria-label="Reading your inbox and calendar">
          <div /><div /><div /><div />
        </div>
      )}
      {state.kind === "signed_out" && (
        <p className="banner">
          Connect your Google account to rank your own inbox. <Link href="/api/auth/login" prefetch={false}>Connect Gmail</Link>
        </p>
      )}
      {state.kind === "error" && <p className="banner error">{state.message}</p>}
      {state.kind === "ready" && <BriefView brief={state.brief} />}
      <Footer />
    </main>
  );
}
