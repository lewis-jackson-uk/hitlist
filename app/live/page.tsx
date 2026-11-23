"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BriefView } from "@/components/BriefView";
import { Footer } from "@/components/Footer";
import type { Brief } from "@/lib/types";

type State = { kind: "loading" } | { kind: "ready"; brief: Brief } | { kind: "signed_out" } | { kind: "error"; message: string };

const SLACK_MESSAGES: Record<string, string> = {
  not_configured: "Slack isn't set up on this deployment yet. Add the Slack settings described in the README.",
  cancelled: "Slack wasn't connected. You can connect it any time.",
  failed: "Slack didn't connect. Try again, and check the redirect URL in your Slack app matches this site.",
};

function LivePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const slackNote = SLACK_MESSAGES[useSearchParams().get("slack") ?? ""];

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/brief", { cache: "no-store" });
      if (res.status === 401) return setState({ kind: "signed_out" });
      const body = await res.json().catch(() => null);
      if (!body) {
        return setState({
          kind: "error",
          message: `The server hit an error (${res.status}). If you've just deployed, check the environment variables in the README are all set, especially SESSION_SECRET.`,
        });
      }
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
              {state.brief.sources?.slackAvailable && !state.brief.sources.slack && (
                <Link className="btn ghost" href="/api/slack/login" prefetch={false}>Connect Slack</Link>
              )}
              {state.brief.sources?.slack && (
                <form action="/api/slack/disconnect" method="post">
                  <button className="btn ghost" type="submit">Disconnect Slack</button>
                </form>
              )}
              <form action="/api/auth/logout" method="post">
                <button className="btn ghost" type="submit">Disconnect all</button>
              </form>
              <span className="note">
                {state.brief.account}{state.brief.sources?.slack ? " and Slack" : ""}. {state.brief.usedClaude ? "Urgency and replies by Claude." : "Rule-based urgency (no Claude key set)."}
              </span>
            </>
          )}
          <Link className="note" href="/">See the sample inbox</Link>
        </div>
      </header>

      {slackNote && <p className="banner">{slackNote}</p>}
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

// useSearchParams needs a Suspense boundary in the App Router.
export default function Live() {
  return (
    <Suspense>
      <LivePage />
    </Suspense>
  );
}
