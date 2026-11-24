export type Channel = "gmail" | "slack" | "whatsapp";

/** How much a sender matters, before looking at what they wrote. */
export type SenderTier = "key" | "known" | "unknown";

export interface Person {
  name: string;
  email: string;
}

export interface Urgency {
  /** 0 = none, 1 = mild (a question), 2 = time-bound, 3 = blocking / today */
  level: 0 | 1 | 2 | 3;
  /** Short human reason, e.g. "Asks you to sign by Friday" */
  reason?: string;
  source: "claude" | "rules";
}

/** A conversation where the last message is from someone else, so the ball is in your court. */
export interface WaitingItem {
  id: string;
  channel: Channel;
  url?: string;
  from: Person;
  subject: string;
  snippet: string;
  /** ISO timestamp of the message you have not answered */
  lastMessageAt: string;
  messageCount: number;
  /** You have written to this person before (in this thread or elsewhere) */
  knownContact: boolean;
  /** You are in To, not just CC */
  isDirect: boolean;
  urgency?: Urgency;
  draft?: string;
  /** Where in the channel, e.g. "#product" or "Group DM". Used for Slack. */
  location?: string;
}

export interface Meeting {
  id: string;
  title: string;
  /** ISO start time */
  start: string;
  attendees: Person[];
  /** Has a description or attached doc */
  hasAgenda: boolean;
  url?: string;
}

export interface RankedItem {
  item: WaitingItem;
  score: number;
  tier: SenderTier;
  reasons: string[];
  /** The soonest upcoming meeting with this sender, if any */
  meeting?: Meeting;
}

export interface PrepFlag {
  meeting: Meeting;
  reasons: string[];
  /** Unanswered threads from attendees of this meeting */
  openThreads: number;
}

export interface Brief {
  generatedAt: string;
  mode: "demo" | "live";
  account?: string;
  ranked: RankedItem[];
  /** Emails you sent that are still waiting on a reply, with a nudge to send */
  followUps?: RankedItem[];
  prep: PrepFlag[];
  usedClaude: boolean;
  /** Whether a Claude key is set, and why Claude didn't run if it failed */
  claude?: { configured: boolean; error?: string };
  /** Which sources this brief covers, and whether Slack can be connected on this deployment */
  sources?: { gmail: boolean; slack: boolean; slackAvailable: boolean };
  /** Non-fatal problems, e.g. one source failed but the rest worked */
  warnings?: string[];
}
