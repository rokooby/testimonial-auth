import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { parseEther, formatEther } from "viem";
import {
  ShieldCheck,
  Sparkle,
  Handshake,
  Scales,
  SealCheck,
  WarningOctagon,
  ArrowsClockwise,
  PaperPlaneRight,
  Lightning,
  ArrowClockwise,
  Copy,
  Graph,
  Coins,
  UserFocus,
  X,
  Trophy,
  Pulse,
  Crosshair,
  ArrowLeft,
} from "@phosphor-icons/react";
import {
  postVouch, challenge, adjudicate, classifyRelationship, settle,
  confirmUnchallenged, startChallengePeriod, reclaimBond, getVouch, getSubject, getSubjectSlugs,
  getCounts, getPoolBalance, listAll,
  VS, STATUS_LABEL, VouchView, VouchRow, Counts, SubjectView,
} from "./contractService";
import { CONTRACT_ADDRESS } from "./chain";
import { GLSLHills } from "./GLSLHills";

type Hex = `0x${string}`;

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}\u2026${a.slice(-4)}` : a || "\u2014";
}
function gen(wei: string): string {
  if (!wei || wei === "0") return "0";
  try {
    const v = formatEther(BigInt(wei));
    const n = Number(v);
    return Number.isFinite(n) ? (Math.round(n * 1000) / 1000).toString() : v;
  } catch {
    return "0";
  }
}
function genNum(wei: string): number {
  if (!wei || wei === "0") return 0;
  try {
    const n = Number(formatEther(BigInt(wei)));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
function duration(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}h ${minutes}m ${secs}s`;
}
async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); } catch { /* clipboard blocked */ }
}

// Trust score is presented on a 0..100 scale; clamp anything outside.
function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// --- display state for a vouch: GENUINE / CHALLENGED / REAL / FAKE / CONFIRMED ---
type StateKey = "genuine" | "challenged" | "real" | "fake" | "confirmed";
function vouchState(v: { status: number; verdict: string }): { key: StateKey; label: string } {
  if (v.verdict === "REAL") return { key: "real", label: "REAL" };
  if (v.verdict === "FAKE") return { key: "fake", label: "FAKE" };
  if (v.status === VS.CHALLENGED) return { key: "challenged", label: "CHALLENGED" };
  if (v.status === VS.CONFIRMED) return { key: "confirmed", label: "CONFIRMED" };
  if (v.status === VS.SETTLED) return { key: "confirmed", label: "SETTLED" };
  return { key: "genuine", label: "GENUINE" };
}

// --- count-up hook for stat tiles & bond figures -------------------------------
function useCountUp(target: number, deps: unknown[] = []): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (REDUCED) { setVal(target); fromRef.current = target; return; }
    const from = fromRef.current;
    const to = target;
    if (from === to) { setVal(to); return; }
    const start = performance.now();
    const dur = 620;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return val;
}

// --- Vouch bespoke mark: linked seal (two nodes + knotted check in a hexagon) ---
function VouchMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="vmk" x1="7" y1="6" x2="33" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c08bff" />
          <stop offset="1" stopColor="#ffd27a" />
        </linearGradient>
      </defs>
      <path
        d="M20 3.2 L32.4 10.4 L32.4 24.8 L20 32 L7.6 24.8 L7.6 10.4 Z"
        stroke="url(#vmk)"
        strokeWidth="1.6"
        opacity="0.7"
        fill="rgba(192,139,255,0.06)"
      />
      {/* the edge that knots into a check between two nodes */}
      <path
        d="M12.5 18.5 L17.4 23.4 L27.5 12.8"
        stroke="url(#vmk)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="12.5" cy="18.5" r="3" fill="#c08bff" />
      <circle cx="27.5" cy="12.8" r="3" fill="#ffd27a" />
    </svg>
  );
}

// --- circular gold trust-score meter -------------------------------------------
function TrustRing({ score, size = 56, animate = true }: { score: number; size?: number; animate?: boolean }) {
  const s = clampScore(score);
  const display = useCountUp(animate ? s : s, [s, animate]);
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = (animate && !REDUCED ? display : s) / 100;
  const off = c * (1 - pct);
  const warmth = s / 100; // 0..1 → glow intensity
  const stroke = Math.max(4, size * 0.07);
  return (
    <div className="ring" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`tr-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c08bff" />
            <stop offset="1" stopColor="#ffd27a" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(124,106,137,0.25)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#tr-${size})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: REDUCED ? "none" : "stroke-dashoffset 0.6s ease",
            filter: `drop-shadow(0 0 ${2 + warmth * 6}px rgba(255,210,122,${0.25 + warmth * 0.5}))`,
          }}
        />
      </svg>
      <span className="ring__val" style={{ fontSize: Math.max(11, size * 0.26) }}>
        {Math.round(animate && !REDUCED ? display : s)}
      </span>
    </div>
  );
}

function StateBadge({ s }: { s: { key: StateKey; label: string } }) {
  return <span className={`badge st-${s.key}`}>{s.label}</span>;
}

// Deterministic 2-letter glyph for an author/subject node avatar.
function initials(label: string): string {
  const clean = (label || "").replace(/^0x/, "").trim();
  if (!clean) return "\u00b7\u00b7";
  const words = clean.split(/[\s\-_]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

type Panel =
  | { mode: "post" }
  | { mode: "vouch"; id: number }
  | { mode: "subject"; slug: string }
  | null;

export function App() {
  const { address, isConnected } = useAccount();
  const acct = address as Hex | undefined;

  const [subjectSlug, setSubjectSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [relationshipText, setRelationshipText] = useState("");
  const [claimText, setClaimText] = useState("");
  const [bond, setBond] = useState("");
  const [stake, setStake] = useState("");

  const [rows, setRows] = useState<VouchRow[]>([]);
  const [subjects, setSubjects] = useState<Record<string, SubjectView>>({});
  const [counts, setCounts] = useState<Counts>({ next: 0, challenged: 0, adjudicated: 0, fake: 0, confirmed: 0, pool: "0" });
  const [pool, setPool] = useState("0");

  const [panel, setPanel] = useState<Panel>(null);
  const [sel, setSel] = useState<VouchView | null>(null);
  const [selSubject, setSelSubject] = useState<SubjectView | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [netErr, setNetErr] = useState(false);
  const [loading, setLoading] = useState(true);

  const selId = panel && panel.mode === "vouch" ? panel.id : null;

  async function refreshAll() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const [c, p, l] = await Promise.all([getCounts(), getPoolBalance(), listAll(80)]);
      setCounts(c); setPool(p); setRows(l);
      if (selId != null) { try { setSel(await getVouch(selId)); } catch { /* keep */ } }
      // best-effort subject map for trust scores + leaderboard
      try {
        const slugs = await getSubjectSlugs();
        if (slugs.length) {
          const subs = await Promise.all(
            slugs.slice(0, 80).map(async (slug) => {
              try { return await getSubject(slug); } catch { return null; }
            })
          );
          const map: Record<string, SubjectView> = {};
          for (const s of subs) if (s && s.slug) map[s.slug] = s;
          setSubjects(map);
        }
      } catch { /* subjects optional */ }
      setNetErr(false);
    } catch {
      setNetErr(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 12000);
    const onVis = () => { if (!document.hidden) refreshAll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    setSel(null);
    setSelSubject(null);
  }, []);

  // Escape closes the slide-over.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, closePanel]);

  async function openVouch(id: number) {
    setPanel({ mode: "vouch", id });
    setSelSubject(null);
    try {
      const v = await getVouch(id);
      setSel(v);
      if (v.subjectSlug) {
        try { setSelSubject(await getSubject(v.subjectSlug)); } catch { setSelSubject(null); }
      } else setSelSubject(null);
    } catch { setSel(null); setSelSubject(null); }
  }
  async function openSubject(slug: string) {
    if (!slug) return;
    setPanel({ mode: "subject", slug });
    setSel(null);
    if (subjects[slug]) setSelSubject(subjects[slug]);
    try { setSelSubject(await getSubject(slug)); } catch { /* keep cached */ }
  }
  function openForm() {
    setPanel({ mode: "post" });
    setSel(null);
    setSelSubject(null);
  }

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label); setNote("");
    try { return await fn(); }
    catch (e) { setNote(String((e as Error).message || e).slice(0, 240)); return undefined; }
    finally { setBusy(null); refreshAll(); }
  }

  async function onPost() {
    if (!acct) return setNote("Connect a wallet to post a vouch.");
    if (subjectSlug.trim().length < 2 && displayName.trim().length < 2) return setNote("A subject slug or display name is required.");
    if (relationshipText.trim().length < 30) return setNote("Describe the relationship (\u2265 30 chars).");
    if (!(Number(bond) > 0)) return setNote("A GEN bond is required, e.g. 1.");
    const id = await run("Posting vouch", () =>
      postVouch(acct, {
        subjectSlug, displayName, relationshipText, claimText,
        bondWei: parseEther(bond.trim()),
      })
    );
    if (id != null) {
      setSubjectSlug(""); setDisplayName(""); setRelationshipText(""); setClaimText(""); setBond("");
      setNote(`Vouch #${id} posted.`);
      openVouch(id);
    }
  }
  async function onChallenge() {
    if (!acct || selId == null) return;
    if (!(Number(stake) > 0)) return setNote("A GEN stake is required to challenge.");
    await run("Challenging vouch", () => challenge(acct, selId, parseEther(stake.trim())));
    setStake("");
  }
  async function onAdjudicate() { if (acct && selId != null) await run("Validators adjudicating", () => adjudicate(acct, selId)); }
  async function onClassify() { if (acct && selId != null) await run("Classifying relationship", () => classifyRelationship(acct, selId)); }
  async function onSettle() { if (acct && selId != null) await run("Settling vouch", () => settle(acct, selId)); }
  async function onConfirm() { if (acct && selId != null) await run("Confirming unchallenged", () => confirmUnchallenged(acct, selId)); }
  async function onStartChallengePeriod() { if (acct && selId != null) await run("Starting challenge period", () => startChallengePeriod(acct, selId)); }
  async function onReclaim() { if (acct && selId != null) await run("Reclaiming bond", () => reclaimBond(acct, selId)); }

  const bondsLocked = useMemo(() => {
    let total = 0;
    for (const r of rows) {
      if (r.status === VS.SETTLED) continue;
      total += genNum(r.authorBond) + genNum(r.challengeStake);
    }
    return total;
  }, [rows]);

  // Leaderboard: subjects ranked by trust score, then by vouch volume.
  const leaderboard = useMemo(() => {
    return Object.values(subjects)
      .slice()
      .sort((a, b) => (b.trustScore - a.trustScore) || (b.vouchesTotal - a.vouchesTotal))
      .slice(0, 8);
  }, [subjects]);

  // Vouches that belong to the subject currently open in the profile panel.
  const subjectVouches = useMemo(() => {
    if (!panel || panel.mode !== "subject") return [];
    return rows.filter((r) => r.subjectSlug === panel.slug);
  }, [rows, panel]);

  const isAuthor = !!sel && !!acct && sel.author.toLowerCase() === acct.toLowerCase();

  return (
    <div className="page">
      {/* full-page animated GLSL hills background */}
      <div className="bg-hills" aria-hidden="true">
        <GLSLHills className="bg-hills__canvas" color={[0.66, 0.58, 0.79]} />
      </div>

      <header className="nav">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true"><VouchMark size={26} /></span>
          <span className="brand__name">Vouch</span>
          <span className="brand__sep">/</span>
          <span className="brand__sub">the trust feed</span>
        </div>
        <div className="nav__right">
          <span className={`pulse ${netErr ? "off" : ""}`}>
            <i /> {netErr ? "reconnecting" : "studionet live"}
          </span>
          <button className="btn btn--primary nav__post" onClick={openForm}>
            <Handshake size={17} weight="bold" /> Post a vouch
          </button>
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
        </div>
      </header>

      {/* two-zone shell: persistent summary sidebar + single-column vertical feed */}
      <main className="shell">
        <aside className="summary" aria-label="Trust summary">
          <div className="summary__sticky">
            <section className="panel sboard">
              <div className="panel__head">
                <span className="panel__kick"><Trophy size={15} weight="fill" /> Top trusted subjects</span>
              </div>
              {leaderboard.length === 0 ? (
                <p className="muted small">No subjects scored yet.</p>
              ) : (
                <ol className="board">
                  {leaderboard.map((s, i) => (
                    <li key={s.slug}>
                      <button className="board__row" onClick={() => openSubject(s.slug)}>
                        <span className={`board__rank r${i + 1}`}>{i + 1}</span>
                        <span className="board__av" aria-hidden="true">{initials(s.displayName || s.slug)}</span>
                        <span className="board__id">
                          <b>{s.displayName || s.slug}</b>
                          <small>{s.vouchesTotal} vouches \u00b7 {s.confirmedGenuine} genuine</small>
                        </span>
                        <TrustRing score={s.trustScore} size={34} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="panel sstats">
              <div className="panel__head">
                <span className="panel__kick"><Pulse size={15} weight="bold" /> Global signals</span>
              </div>
              <div className="sstats__grid">
                <SummaryStat icon={<Graph size={15} weight="duotone" />} cap="Vouches" val={counts.next} mono={false} />
                <SummaryStat icon={<Lightning size={15} weight="duotone" />} cap="Challenged" val={counts.challenged} mono={false} />
                <SummaryStat icon={<SealCheck size={15} weight="duotone" />} cap="Confirmed" val={counts.confirmed} mono={false} />
                <SummaryStat icon={<WarningOctagon size={15} weight="duotone" />} cap="Ruled fake" val={counts.fake} mono={false} />
                <SummaryStat icon={<Coins size={15} weight="duotone" />} cap="Bonds locked" val={bondsLocked} mono={true} />
                <SummaryStat icon={<ShieldCheck size={15} weight="duotone" />} cap="Pool GEN" val={genNum(pool)} mono={true} />
              </div>
            </section>
          </div>
        </aside>

        <section className="feed" aria-label="Vouch feed">
          <div className="feed__head">
            <h2 className="feed__title">The trust feed</h2>
            <span className="feed__count">
              {rows.length === 0 ? "nothing posted yet" : `${rows.length} vouches \u00b7 newest first`}
            </span>
          </div>

          {loading && rows.length === 0 ? (
            <p className="muted">Loading the feed&hellip;</p>
          ) : rows.length === 0 ? (
            <div className="panel placeholder">
              <span className="placeholder__icon"><Graph size={40} weight="duotone" /></span>
              <h3>No vouches yet</h3>
              <p>Post the first attestation to light up the trust graph.</p>
              <button className="btn btn--primary" onClick={openForm}>
                <Handshake size={16} weight="bold" /> Post a vouch
              </button>
            </div>
          ) : (
            <ol className="thread">
              {rows.map((r) => (
                <VouchPost
                  key={r.id}
                  row={r}
                  subject={subjects[r.subjectSlug]}
                  active={selId === r.id}
                  onOpen={openVouch}
                  onOpenSubject={openSubject}
                />
              ))}
            </ol>
          )}
        </section>
      </main>

      <footer className="foot">
        <div className="foot__brand">
          <span className="brand__mark sm" aria-hidden="true"><VouchMark size={20} /></span>
          <span className="brand__name small">Vouch</span>
        </div>
        <span className="muted">
          Protocol pool {gen(pool)} GEN \u00b7 {counts.fake} fakes ruled. Verdicts reproduced by independent
          GenLayer validators on studionet.
        </span>
        <button type="button" className="copybtn" onClick={() => copyText(CONTRACT_ADDRESS)} aria-label="Copy contract address">
          <code>{shortAddr(CONTRACT_ADDRESS)}</code> <Copy size={13} weight="bold" />
        </button>
      </footer>

      {/* ---------- slide-over panel (post / detail / subject profile) ---------- */}
      {panel && (
        <div className="slideover" role="dialog" aria-modal="true" aria-label="Vouch panel">
          <div className="slideover__scrim" onClick={closePanel} />
          <div className="slideover__sheet">
            <button className="slideover__close" onClick={closePanel} aria-label="Close panel">
              <X size={18} weight="bold" />
            </button>

            {panel.mode === "post" && (
              <PostForm
                subjectSlug={subjectSlug} setSubjectSlug={setSubjectSlug}
                displayName={displayName} setDisplayName={setDisplayName}
                relationshipText={relationshipText} setRelationshipText={setRelationshipText}
                claimText={claimText} setClaimText={setClaimText}
                bond={bond} setBond={setBond}
                isConnected={isConnected} busy={busy} onPost={onPost}
              />
            )}

            {panel.mode === "vouch" && (
              sel && selId != null ? (
                <VouchDetail
                  sel={sel}
                  selId={selId}
                  subject={selSubject}
                  isAuthor={isAuthor}
                  isConnected={isConnected}
                  busy={busy}
                  stake={stake}
                  setStake={setStake}
                  onChallenge={onChallenge}
                  onAdjudicate={onAdjudicate}
                  onClassify={onClassify}
                  onSettle={onSettle}
                  onConfirm={onConfirm}
                  onStartChallengePeriod={onStartChallengePeriod}
                  onReclaim={onReclaim}
                  onOpenSubject={openSubject}
                />
              ) : (
                <p className="muted" style={{ padding: 24 }}>
                  <ArrowClockwise size={16} weight="bold" className="spin" /> Loading vouch&hellip;
                </p>
              )
            )}

            {panel.mode === "subject" && (
              <SubjectProfile
                slug={panel.slug}
                subject={selSubject}
                vouches={subjectVouches}
                allSubjects={subjects}
                onOpenVouch={openVouch}
              />
            )}
          </div>
        </div>
      )}

      {(busy || note) && (
        <div className={`toast ${note && !busy ? "toast--note" : ""}`} role="status">
          {busy ? (<><ArrowClockwise size={16} weight="bold" className="spin" /> {busy}&hellip;</>) : (<><Sparkle size={16} weight="fill" /> {note}</>)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function SummaryStat({ icon, cap, val, mono }: { icon: React.ReactNode; cap: string; val: number; mono: boolean }) {
  const animated = useCountUp(val, [val]);
  const shown = mono
    ? (Math.round(animated * 1000) / 1000).toString()
    : Math.round(animated).toString();
  return (
    <div className="sstat">
      <span className="sstat__icon">{icon}</span>
      <span className="sstat__val">{shown}</span>
      <span className="sstat__cap">{cap}</span>
    </div>
  );
}

// A rich feed post: author → subject line, claim, bond, state, trust ring.
function VouchPost({
  row, subject, active, onOpen, onOpenSubject,
}: {
  row: VouchRow;
  subject?: SubjectView;
  active: boolean;
  onOpen: (id: number) => void;
  onOpenSubject: (slug: string) => void;
}) {
  const st = vouchState(row);
  const subjLabel = subject?.displayName || row.subjectSlug || "untitled";
  const score = subject ? subject.trustScore : 0;
  const claim = row.claimText && row.claimText.trim().length > 0 ? row.claimText : row.relationshipText;
  return (
    <li className={`post st-${st.key} ${active ? "is-active" : ""}`}>
      <div className="post__spine" aria-hidden="true">
        <span className="post__av post__av--author">{initials(row.author)}</span>
        <span className="post__thread" />
      </div>
      <article
        className="post__body"
        role="button"
        tabIndex={0}
        aria-label={`Vouch ${row.id} by ${shortAddr(row.author)} for ${subjLabel}, ${st.label}, trust score ${clampScore(score)} of 100`}
        onClick={() => onOpen(row.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(row.id); } }}
      >
        <header className="post__head">
          <div className="post__rel">
            <code className="addr">{shortAddr(row.author)}</code>
            <span className="post__verb">vouches for</span>
            <button
              className="post__subj"
              onClick={(e) => { e.stopPropagation(); onOpenSubject(row.subjectSlug); }}
              title="Open subject profile"
            >
              {subjLabel}
            </button>
          </div>
          <div className="post__meta">
            <code className="post__id">#{String(row.id).padStart(2, "0")}</code>
            <StateBadge s={st} />
          </div>
        </header>

        <p className="post__claim">
          {claim.slice(0, 240)}{claim.length > 240 ? "\u2026" : ""}
        </p>

        <footer className="post__foot">
          <div className="post__tags">
            <span className="post__bond"><b>{gen(row.authorBond)}</b> GEN bond</span>
            <span className="post__chip">{STATUS_LABEL[row.status] || row.status}</span>
            {row.relationshipType && <span className="post__chip soft">{row.relationshipType}</span>}
            {row.status >= VS.CHALLENGED && genNum(row.challengeStake) > 0 && (
              <span className="post__chip warn">{gen(row.challengeStake)} GEN staked</span>
            )}
          </div>
          <button
            className="post__ring"
            onClick={(e) => { e.stopPropagation(); onOpenSubject(row.subjectSlug); }}
            aria-label={`${subjLabel} trust score ${clampScore(score)}`}
            title="Open subject profile"
          >
            <TrustRing score={score} size={46} />
            <span className="post__ringcap">trust</span>
          </button>
        </footer>

        {st.key === "real" && <span className="seal seal--real" aria-hidden="true"><SealCheck size={15} weight="fill" /></span>}
        {st.key === "fake" && <span className="seal seal--fake" aria-hidden="true"><WarningOctagon size={15} weight="fill" /></span>}
      </article>
    </li>
  );
}

// ---------------------------------------------------------------------------
function PostForm(props: {
  subjectSlug: string; setSubjectSlug: (v: string) => void;
  displayName: string; setDisplayName: (v: string) => void;
  relationshipText: string; setRelationshipText: (v: string) => void;
  claimText: string; setClaimText: (v: string) => void;
  bond: string; setBond: (v: string) => void;
  isConnected: boolean; busy: string | null; onPost: () => void;
}) {
  return (
    <div className="sheet__inner">
      <div className="sheet__head">
        <span className="sheet__kick"><Handshake size={16} weight="bold" /> Post a vouch</span>
        <h2 className="sheet__title">Back a claim with a bond</h2>
        <p className="sheet__lead">Your bond stands behind the relationship. If it&rsquo;s challenged and ruled FAKE, the bond is slashed to the challenger.</p>
      </div>
      <label className="field">
        <span>Subject slug (or leave blank to use name)</span>
        <input value={props.subjectSlug} onChange={(e) => props.setSubjectSlug(e.target.value)} placeholder="e.g. jane-doe" />
      </label>
      <label className="field">
        <span>Display name</span>
        <input value={props.displayName} onChange={(e) => props.setDisplayName(e.target.value)} placeholder="e.g. Jane Doe" />
      </label>
      <label className="field">
        <span>Relationship (how you know them, \u2265 30 chars)</span>
        <textarea
          value={props.relationshipText}
          onChange={(e) => props.setRelationshipText(e.target.value)}
          placeholder="We shipped the payments rewrite together at Acme in 2023; she led the ledger service\u2026"
        />
      </label>
      <label className="field">
        <span>Claim (optional)</span>
        <textarea value={props.claimText} onChange={(e) => props.setClaimText(e.target.value)} placeholder="What you're attesting to." />
      </label>
      <label className="field">
        <span>Bond (GEN)</span>
        <input value={props.bond} onChange={(e) => props.setBond(e.target.value)} placeholder="e.g. 1" inputMode="decimal" />
      </label>
      <button className="btn btn--primary full" disabled={!props.isConnected || !!props.busy} onClick={props.onPost}>
        <PaperPlaneRight size={18} weight="bold" /> Post vouch
      </button>
      {!props.isConnected && <p className="muted">Connect a wallet to post.</p>}
    </div>
  );
}

function VouchDetail(props: {
  sel: VouchView;
  selId: number;
  subject: SubjectView | null;
  isAuthor: boolean;
  isConnected: boolean;
  busy: string | null;
  stake: string;
  setStake: (v: string) => void;
  onChallenge: () => void;
  onAdjudicate: () => void;
  onClassify: () => void;
  onSettle: () => void;
  onConfirm: () => void;
  onStartChallengePeriod: () => void;
  onReclaim: () => void;
  onOpenSubject: (slug: string) => void;
}) {
  const { sel, selId, subject, isAuthor, isConnected, busy } = props;
  const st = vouchState(sel);
  const subjLabel = subject?.displayName || sel.subjectSlug || "subject";
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (sel.status !== VS.OPEN || sel.challengeDeadline <= 0) return;
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [sel.status, sel.challengeDeadline]);
  const legacyWindow = sel.status === VS.OPEN && sel.challengeDeadline <= 0;
  const challengeRemaining = Math.max(0, sel.challengeDeadline - nowSeconds);
  const challengeActive = sel.status === VS.OPEN && challengeRemaining > 0;
  return (
    <div className={`sheet__inner detail st-${st.key}`}>
      <div className="sheet__head">
        <span className="sheet__kick"><Graph size={16} weight="fill" /> Vouch #{String(selId).padStart(2, "0")}</span>
        <div className="sheet__headrow">
          <h2 className="sheet__title">Attestation detail</h2>
          <StateBadge s={st} />
        </div>
      </div>

      {/* subject mini-card → opens the full subject profile */}
      <button className="subj subj--btn" onClick={() => props.onOpenSubject(sel.subjectSlug)} title="Open subject profile">
        <TrustRing score={subject ? subject.trustScore : 0} size={66} />
        <div className="subj__body">
          <h3 className="subj__name">{subjLabel}</h3>
          <code className="subj__slug">{sel.subjectSlug || "\u2014"}</code>
          {subject && (
            <div className="subj__hist">
              <span><b>{subject.vouchesTotal}</b> vouches</span>
              <span className="ok"><b>{subject.confirmedGenuine}</b> genuine</span>
              <span className="bad"><b>{subject.fabricated}</b> fake</span>
              <span><b>{subject.inDegree}</b> in-degree</span>
            </div>
          )}
          <span className="subj__cta"><UserFocus size={13} weight="bold" /> View profile</span>
        </div>
      </button>

      <div className="detail__grid">
        <div><span>Author</span><code>{shortAddr(sel.author)}</code></div>
        <div><span>Status</span><b>{STATUS_LABEL[sel.status] || sel.status}</b></div>
        <div><span>Bond</span><b className="hot">{gen(sel.authorBond)} GEN</b></div>
        {sel.challengeDeadline > 0 && (
          <div><span>Challenge deadline</span><b>{new Date(sel.challengeDeadline * 1000).toLocaleString()}</b></div>
        )}
        {sel.status >= VS.CHALLENGED && (
          <>
            <div><span>Challenger</span><code>{shortAddr(sel.challenger)}</code></div>
            <div><span>Stake</span><b>{gen(sel.challengeStake)} GEN</b></div>
          </>
        )}
        {sel.verdict && (
          <>
            <div><span>Authenticity</span><b>{sel.authenticityConf}</b></div>
            <div><span>Fab. signals</span><b>{sel.fabricationSignals}</b></div>
          </>
        )}
      </div>

      {sel.verdict && (
        <div className={`verdict st-${st.key}`}>
          {st.key === "real"
            ? <><SealCheck size={18} weight="fill" /> Ruled REAL &mdash; the bond holds.</>
            : <><WarningOctagon size={18} weight="fill" /> Ruled FAKE &mdash; the bond is slashed.</>}
        </div>
      )}

      {(sel.relationshipType || sel.independenceScore) && (
        <div className="chips">
          {sel.relationshipType && <span className="chip">{sel.relationshipType}</span>}
          {sel.relationshipType && <span className="chip soft">independence {sel.independenceScore}</span>}
        </div>
      )}

      <div className="block">
        <span className="block__cap">Relationship</span>
        <p className="evidence">{sel.relationshipText}</p>
      </div>
      {sel.claimText && (
        <div className="block">
          <span className="block__cap">Claim</span>
          <p className="evidence">{sel.claimText}</p>
        </div>
      )}
      {sel.rationale && (
        <div className="block block--rationale">
          <span className="block__cap">Validator rationale</span>
          <p>{sel.rationale}</p>
        </div>
      )}

      {/* OPEN: challenge, or confirm */}
      {sel.status === VS.OPEN && (
        <div className="action-stack">
          <div className={`challenge-window ${challengeActive ? "active" : "ended"}`}>
            {legacyWindow
              ? "This pre-upgrade vouch needs a fresh 24-hour challenge period."
              : challengeActive
                ? `Challenge window open for ${duration(challengeRemaining)}. Confirmation is locked on-chain.`
                : "The 24-hour challenge window has ended. Unchallenged confirmation is now available."}
          </div>
          {legacyWindow ? (
            <button className="btn btn--primary full" disabled={!isConnected || !!busy} onClick={props.onStartChallengePeriod}>
              <ArrowClockwise size={18} weight="bold" /> Start 24-hour challenge period
            </button>
          ) : (
            <>
          <label className="field">
            <span>Challenge stake (GEN)</span>
            <input value={props.stake} onChange={(e) => props.setStake(e.target.value)} placeholder="e.g. 1" inputMode="decimal" />
          </label>
          <button className="btn btn--primary full" disabled={!isConnected || !!busy || !challengeActive} onClick={props.onChallenge}>
            <Lightning size={18} weight="bold" /> Challenge it
          </button>
          <button className="btn btn--ghost full" disabled={!isConnected || !!busy || challengeActive} onClick={props.onConfirm}>
            <SealCheck size={18} weight="bold" /> Confirm unchallenged
          </button>
            </>
          )}
        </div>
      )}
      {/* CHALLENGED: adjudicate */}
      {sel.status === VS.CHALLENGED && (
        <button className="btn btn--primary full" disabled={!isConnected || !!busy} onClick={props.onAdjudicate}>
          <Scales size={18} weight="bold" /> Send to the validators
        </button>
      )}
      {/* ADJUDICATED: classify + settle */}
      {sel.status === VS.ADJUDICATED && (
        <div className="action-stack">
          {!sel.relationshipType && (
            <button className="btn btn--ghost full" disabled={!isConnected || !!busy} onClick={props.onClassify}>
              <ArrowsClockwise size={18} weight="bold" /> Re-judge (classify)
            </button>
          )}
          <button className="btn btn--primary full" disabled={!isConnected || !!busy} onClick={props.onSettle}>
            <Coins size={18} weight="bold" /> Settle payout
          </button>
        </div>
      )}
      {/* CONFIRMED: classify + reclaim bond */}
      {sel.status === VS.CONFIRMED && (
        <div className="action-stack">
          {!sel.relationshipType && (
            <button className="btn btn--ghost full" disabled={!isConnected || !!busy} onClick={props.onClassify}>
              <ArrowsClockwise size={18} weight="bold" /> Re-judge (classify)
            </button>
          )}
          <button className="btn btn--primary full" disabled={!isConnected || !!busy || !isAuthor} onClick={props.onReclaim}>
            <Coins size={18} weight="bold" /> Confirm &amp; reclaim
          </button>
          {!isAuthor && <p className="muted">Only the author can reclaim the bond.</p>}
        </div>
      )}
      {sel.status === VS.SETTLED && (
        <p className="muted"><SealCheck size={16} weight="fill" /> Settled. Funds released to the winner.</p>
      )}
    </div>
  );
}

// Subject profile: large trust ring, history of vouches/outcomes, relationship
// + independence labels. Derived from the existing contract data.
function SubjectProfile(props: {
  slug: string;
  subject: SubjectView | null;
  vouches: VouchRow[];
  allSubjects: Record<string, SubjectView>;
  onOpenVouch: (id: number) => void;
}) {
  const { slug, subject, vouches, onOpenVouch } = props;
  const name = subject?.displayName || slug || "subject";

  // Derive relationship/independence labels honestly from this subject's vouches.
  const relTypes = useMemo(() => {
    const set = new Set<string>();
    for (const v of vouches) if (v.relationshipType) set.add(v.relationshipType);
    return Array.from(set);
  }, [vouches]);
  const indep = useMemo(() => {
    const vals = vouches.map((v) => v.independenceScore).filter((n) => Number.isFinite(n) && n > 0);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [vouches]);

  const realCount = vouches.filter((v) => v.verdict === "REAL").length;
  const fakeCount = vouches.filter((v) => v.verdict === "FAKE").length;

  return (
    <div className="sheet__inner profile">
      <div className="sheet__head">
        <span className="sheet__kick"><UserFocus size={16} weight="fill" /> Subject profile</span>
      </div>

      <div className="profile__hero">
        <TrustRing score={subject ? subject.trustScore : 0} size={128} />
        <div className="profile__id">
          <h2 className="profile__name">{name}</h2>
          <code className="profile__slug">{slug}</code>
          <div className="profile__labels">
            {relTypes.length > 0
              ? relTypes.map((t) => <span key={t} className="chip">{t}</span>)
              : <span className="chip soft">relationships unclassified</span>}
            {indep != null && <span className="chip soft">avg independence {indep}</span>}
          </div>
        </div>
      </div>

      <div className="profile__stats">
        <div className="pstat"><b>{subject?.vouchesTotal ?? vouches.length}</b><span>vouches</span></div>
        <div className="pstat ok"><b>{subject?.confirmedGenuine ?? 0}</b><span>genuine</span></div>
        <div className="pstat bad"><b>{subject?.fabricated ?? 0}</b><span>fabricated</span></div>
        <div className="pstat"><b>{subject?.inDegree ?? 0}</b><span>in-degree</span></div>
      </div>

      {(realCount > 0 || fakeCount > 0) && (
        <div className="profile__outcomes">
          <span className="ok"><SealCheck size={14} weight="fill" /> {realCount} ruled REAL</span>
          <span className="bad"><WarningOctagon size={14} weight="fill" /> {fakeCount} ruled FAKE</span>
        </div>
      )}

      <div className="block">
        <span className="block__cap">Vouch history</span>
        {vouches.length === 0 ? (
          <p className="muted small" style={{ marginTop: 10 }}>No vouches loaded for this subject in the current feed window.</p>
        ) : (
          <ul className="phist">
            {vouches.map((v) => {
              const st = vouchState(v);
              return (
                <li key={v.id}>
                  <button className="phist__row" onClick={() => onOpenVouch(v.id)}>
                    <span className={`phist__dot st-${st.key}`} aria-hidden="true" />
                    <code className="phist__id">#{String(v.id).padStart(2, "0")}</code>
                    <span className="phist__from">
                      <code className="addr">{shortAddr(v.author)}</code>
                    </span>
                    <StateBadge s={st} />
                    <span className="phist__bond">{gen(v.authorBond)} GEN</span>
                    <Crosshair size={14} weight="bold" className="phist__go" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="profile__honest muted small">
        <ArrowLeft size={13} weight="bold" /> Trust score, outcomes, and labels are derived from this
        subject&rsquo;s on-chain vouches. Independence and relationship types appear once validators classify.
      </p>
    </div>
  );
}
