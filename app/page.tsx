import Link from "next/link";
import { BriefView } from "@/components/BriefView";
import { Footer } from "@/components/Footer";
import { buildBrief } from "@/lib/brief";
import { DEMO_ACCOUNT, DEMO_KEY_CONTACTS, demoData, demoSent } from "@/lib/demo-data";
import { googleConfigured } from "@/lib/google";
import { londonDayKey } from "@/lib/commitments";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  not_configured: "Connecting Gmail isn't set up on this deployment yet. Add the Google OAuth settings described in the README.",
  auth_failed: "Google sign-in didn't complete. Try connecting again.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const now = new Date();
  const { items, meetings } = demoData(now);
  const brief = await buildBrief({
    items,
    sent: demoSent(now),
    meetings,
    keyContacts: DEMO_KEY_CONTACTS,
    mode: "demo",
    account: DEMO_ACCOUNT,
    now,
    useClaude: false, // demo drafts are pre-generated so visitors never cost API credit
  });
  brief.sources = { gmail: true, slack: true, slackAvailable: false };

  return (
    <main className="page">
      <header className="mast">
        <h1 className="wordmark">HitList</h1>
        <p className="lede">
          <strong>Who you need to hit up next.</strong> Every email you owe a reply, ranked by who&apos;s waiting, how
          long, and whether you&apos;re about to see them.
        </p>
        <div className="modes">
          {googleConfigured() ? (
            <Link className="btn" href="/api/auth/login" prefetch={false}>Connect Gmail</Link>
          ) : null}
          <span className="note">You&apos;re looking at a sample founder&apos;s email and Slack.</span>
        </div>
      </header>
      {error && ERRORS[error] && <p className="banner error">{ERRORS[error]}</p>}
      {/* Seeded so visitors can see Hit tomorrow and Delegate at work without waiting a day */}
      <BriefView
        brief={brief}
        seed={{ "d-vat": { until: londonDayKey(now), pushes: 1 } }}
        seedDelegations={{
          "d-brand": {
            to: "sam@yourstartup.co",
            note: "Pick whichever logo the team prefers.",
            at: now.toISOString(),
            messageCount: items.find((i) => i.id === "d-brand")!.messageCount,
          },
        }}
      />
      <Footer />
    </main>
  );
}
