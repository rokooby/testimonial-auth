import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "./chain";

type Hex = `0x${string}`;
const TIMEOUT_MS = 240_000;

// Vouch.status (u8): 0 OPEN, 1 CHALLENGED, 2 ADJUDICATED, 3 CONFIRMED, 4 SETTLED
export const VS = { OPEN: 0, CHALLENGED: 1, ADJUDICATED: 2, CONFIRMED: 3, SETTLED: 4 } as const;
export const STATUS_LABEL = ["OPEN", "CHALLENGED", "ADJUDICATED", "CONFIRMED", "SETTLED"];

export type Verdict = "REAL" | "FAKE" | "";

// Mirrors the @allow_storage Vouch dataclass field order.
export interface VouchView {
  author: string;
  subjectSlug: string;
  relationshipText: string;
  claimText: string;
  status: number;
  authorBond: string;
  challenger: string;
  challengeStake: string;
  verdict: Verdict;
  authenticityConf: number;
  fabricationSignals: number;
  relationshipType: string;
  independenceScore: number;
  authorDegreeAtPost: number;
  rationale: string;
  settled: boolean;
  challengeDeadline: number;
}
export interface VouchRow extends VouchView {
  id: number;
}

// Mirrors the @allow_storage Subject dataclass field order.
export interface SubjectView {
  slug: string;
  displayName: string;
  vouchesTotal: number;
  confirmedGenuine: number;
  fabricated: number;
  trustScore: number;
  inDegree: number;
}

export interface Counts {
  next: number;
  challenged: number;
  adjudicated: number;
  fake: number;
  confirmed: number;
  pool: string;
}

function readClient() {
  return createClient({ chain: studionet, account: createAccount() });
}
function writeClient(account: Hex) {
  return createClient({ chain: studionet, account });
}

async function waitAccepted(client: any, hash: Hex) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS);
  });
  try {
    await Promise.race([
      client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function pick(obj: any, key: string, idx: number): any {
  if (obj == null) return undefined;
  if (Array.isArray(obj)) return obj[idx];
  if (typeof obj === "object" && key in obj) return obj[key];
  return undefined;
}
function asBigStr(v: any): string {
  if (v == null) return "0";
  try { return BigInt(v).toString(); } catch { return String(v); }
}

// ---- writes ---------------------------------------------------------------

// post_vouch(subject_slug, display_name, relationship_text, claim_text) payable
export async function postVouch(
  account: Hex,
  f: { subjectSlug: string; displayName: string; relationshipText: string; claimText: string; bondWei: bigint }
): Promise<number> {
  if (f.bondWei <= 0n) throw new Error("A GEN bond is required to back a vouch.");
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "post_vouch",
    args: [f.subjectSlug.trim(), f.displayName.trim(), f.relationshipText.trim(), f.claimText.trim()],
    value: f.bondWei,
  })) as Hex;
  await waitAccepted(wc, h);
  const c = await getCounts();
  return c.next - 1;
}

// challenge(vouch_id) payable
export async function challenge(account: Hex, vouchId: number, stakeWei: bigint): Promise<void> {
  if (stakeWei <= 0n) throw new Error("A GEN stake is required to challenge.");
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "challenge",
    args: [vouchId],
    value: stakeWei,
  })) as Hex;
  await waitAccepted(wc, h);
}

export async function adjudicate(account: Hex, vouchId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName: "adjudicate", args: [vouchId], value: 0n })) as Hex;
  await waitAccepted(wc, h);
}

export async function classifyRelationship(account: Hex, vouchId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName: "classify_relationship", args: [vouchId], value: 0n })) as Hex;
  await waitAccepted(wc, h);
}

export async function settle(account: Hex, vouchId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName: "settle", args: [vouchId], value: 0n })) as Hex;
  await waitAccepted(wc, h);
}

export async function confirmUnchallenged(account: Hex, vouchId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName: "confirm_unchallenged", args: [vouchId], value: 0n })) as Hex;
  await waitAccepted(wc, h);
}

export async function startChallengePeriod(account: Hex, vouchId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName: "start_challenge_period", args: [vouchId], value: 0n })) as Hex;
  await waitAccepted(wc, h);
}

export async function reclaimBond(account: Hex, vouchId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName: "reclaim_bond", args: [vouchId], value: 0n })) as Hex;
  await waitAccepted(wc, h);
}

// ---- views ----------------------------------------------------------------

export async function getVouch(vouchId: number): Promise<VouchView> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_vouch", args: [vouchId] });
  return {
    author: String(pick(r, "author", 0) ?? ""),
    subjectSlug: String(pick(r, "subject_slug", 1) ?? ""),
    relationshipText: String(pick(r, "relationship_text", 2) ?? ""),
    claimText: String(pick(r, "claim_text", 3) ?? ""),
    status: Number(pick(r, "status", 4) ?? 0),
    authorBond: asBigStr(pick(r, "author_bond", 5)),
    challenger: String(pick(r, "challenger", 6) ?? ""),
    challengeStake: asBigStr(pick(r, "challenge_stake", 7)),
    verdict: String(pick(r, "verdict", 8) ?? "") as Verdict,
    authenticityConf: Number(pick(r, "authenticity_conf", 9) ?? 0),
    fabricationSignals: Number(pick(r, "fabrication_signals", 10) ?? 0),
    relationshipType: String(pick(r, "relationship_type", 11) ?? ""),
    independenceScore: Number(pick(r, "independence_score", 12) ?? 0),
    authorDegreeAtPost: Number(pick(r, "author_degree_at_post", 13) ?? 0),
    rationale: String(pick(r, "rationale", 14) ?? ""),
    settled: Boolean(pick(r, "settled", 15) ?? false),
    challengeDeadline: Number(pick(r, "challenge_deadline", 16) ?? 0),
  };
}

export async function getSubject(subjectSlug: string): Promise<SubjectView> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_subject", args: [subjectSlug] });
  return {
    slug: String(pick(r, "slug", 0) ?? ""),
    displayName: String(pick(r, "display_name", 1) ?? ""),
    vouchesTotal: Number(pick(r, "vouches_total", 2) ?? 0),
    confirmedGenuine: Number(pick(r, "confirmed_genuine", 3) ?? 0),
    fabricated: Number(pick(r, "fabricated", 4) ?? 0),
    trustScore: Number(pick(r, "trust_score", 5) ?? 0),
    inDegree: Number(pick(r, "in_degree", 6) ?? 0),
  };
}

export async function getVouchIds(): Promise<number[]> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_vouch_ids", args: [] });
  if (!Array.isArray(r)) return [];
  return r.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

export async function getSubjectSlugs(): Promise<string[]> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_subject_slugs", args: [] });
  if (!Array.isArray(r)) return [];
  return r.map((x) => String(x));
}

export async function getCounts(): Promise<Counts> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_counts", args: [] });
  const p = String(r).split("||");
  return {
    next: Number(p[0]) || 0,
    challenged: Number(p[1]) || 0,
    adjudicated: Number(p[2]) || 0,
    fake: Number(p[3]) || 0,
    confirmed: Number(p[4]) || 0,
    pool: p[5] || "0",
  };
}

export async function getPoolBalance(): Promise<string> {
  const r: any = await readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName: "get_pool_balance", args: [] });
  return asBigStr(r);
}

export async function listAll(maxRows = 80): Promise<VouchRow[]> {
  let ids = await getVouchIds();
  if (ids.length === 0) {
    const { next } = await getCounts();
    for (let i = 0; i < next; i++) ids.push(i);
  }
  // newest first, capped
  ids = ids.slice().sort((a, b) => b - a).slice(0, maxRows);
  const rows = await Promise.all(
    ids.map(async (id) => {
      try {
        const v = await getVouch(id);
        return { id, ...v };
      } catch {
        return null;
      }
    })
  );
  return rows.filter((r): r is VouchRow => r !== null);
}
