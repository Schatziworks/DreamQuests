import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "./lib/supabase";
import {
  ArrowLeft, BookOpen, Check, ChevronDown, CircleDollarSign,
  Compass, Gift, Home, Layers3, ListTodo, LogOut, Plus, Sparkles, Trash2, X
} from "lucide-react";

type Screen = "home" | "capture" | "sort" | "plan" | "quests" | "logbook" | "rewards";
type Pool = "inbox" | "active" | "projects" | "rewards" | "locked" | "ongoing" | "rewardOngoing";
type Quest = {
  id: string;
  title: string;
  createdAt: number;
  pool: Pool;
  dependsOn?: string;
  projectId?: string;
  isReward?: boolean;
};
type AppState = {
  quests: Quest[];
  tokens: number;
  completedCount: number;
};

const STORAGE_KEY = "dreamquests-state-v1";
const LEGACY_STORAGE_KEY = "questbook-state-v1";
const LOCAL_OWNER_KEY = "dreamquests-local-owner-v1";
const MAX_ONGOING = 25;

const initialState: AppState = { quests: [], tokens: 0, completedCount: 0 };

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseState(saved: string | null): AppState {
  try {
    if (!saved) return initialState;
    const parsed = JSON.parse(saved) as AppState;
    if (!Array.isArray(parsed.quests)) return initialState;
    return {
      quests: parsed.quests,
      tokens: Number.isFinite(parsed.tokens) ? parsed.tokens : 0,
      completedCount: Number.isFinite(parsed.completedCount) ? parsed.completedCount : 0
    };
  } catch {
    return initialState;
  }
}

const screenInfo: Record<Exclude<Screen, "home">, { title: string; subtitle: string }> = {
  capture: { title: "Capture", subtitle: "Get it out of your head." },
  sort: { title: "Sort", subtitle: "Give each thought a place." },
  plan: { title: "Plan", subtitle: "Turn projects into next actions." },
  quests: { title: "Quest list", subtitle: "Choose what deserves a slot." },
  logbook: { title: "Logbook", subtitle: "Your active adventures." },
  rewards: { title: "Rewards", subtitle: "Spend tokens on something fun." }
};

const navItems: { id: Exclude<Screen, "home">; label: string; icon: typeof Sparkles; color: string; description: string }[] = [
  { id: "capture", label: "Capture", icon: Sparkles, color: "lavender", description: "Collect ideas and reminders" },
  { id: "sort", label: "Sort", icon: Layers3, color: "blue", description: "Tidy up your quest pool" },
  { id: "plan", label: "Plan", icon: Compass, color: "mint", description: "Break projects into actions" },
  { id: "quests", label: "Quest list", icon: ListTodo, color: "peach", description: "Pick your next quests" },
  { id: "logbook", label: "Logbook", icon: BookOpen, color: "gold", description: "Work on ongoing quests" },
  { id: "rewards", label: "Rewards", icon: Gift, color: "pink", description: "Unlock a little motivation" }
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div className="empty-orb"><Sparkles size={20} /></div><strong>{title}</strong><span>{detail}</span></div>;
}

type AuthMode = "login" | "signup";

function AuthScreen({
  mode, setMode, email, setEmail, password, setPassword, busy, error, message, onSubmit
}: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  error: string;
  message: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="auth-page">
    <div className="auth-card">
      <div className="auth-logo"><Compass size={26} /></div>
      <h1>DreamQuests</h1>
      <p className="auth-intro">Your quests, safely saved and ready on every device.</p>
      <div className="auth-tabs">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Log in</button>
        <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button>
      </div>
      <form onSubmit={onSubmit} className="auth-form">
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" />
        <label htmlFor="auth-password">Password</label>
        <input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} required minLength={6} placeholder="At least 6 characters" />
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p className="auth-privacy">Your game is stored in your own account. Other users cannot access it.</p>
    </div>
  </div>;
}

export default function App() {
  const [data, setData] = useState<AppState>(() => parseState(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)));
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [gameLoadError, setGameLoadError] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [screen, setScreen] = useState<Screen>("home");
  const [captureText, setCaptureText] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [planProjectId, setPlanProjectId] = useState<string | null>(null);
  const [nextActionText, setNextActionText] = useState("");
  const [followUpInputs, setFollowUpInputs] = useState<Record<string, string>>({});
  const [completingIds, setCompletingIds] = useState<string[]>([]);
  const [activeModal, setActiveModal] = useState<"plan" | "slot" | null>(null);
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      setAuthReady(true);
    });
    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!alive) return;
      if (error) setAuthError(error.message);
      setUser(sessionData.session?.user ? { id: sessionData.session.user.id, email: sessionData.session.user.email } : null);
      setAuthReady(true);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setLoadedUserId(null);
      setGameLoadError("");
      return;
    }
    let cancelled = false;
    setLoadedUserId(null);
    setGameLoadError("");
    (async () => {
      const { data: savedRow, error } = await supabase
        .from("game_saves")
        .select("game_state")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setGameLoadError(`Couldn't load your saved game: ${error.message}`);
        return;
      }

      let loadedState: AppState;
      if (savedRow?.game_state) {
        loadedState = parseState(JSON.stringify(savedRow.game_state));
      } else {
        const ownerId = localStorage.getItem(LOCAL_OWNER_KEY);
        const userLocalSave = localStorage.getItem(`${STORAGE_KEY}:${user.id}`);
        const legacySave = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
        const mayImportLegacy = !ownerId || ownerId === user.id;
        loadedState = userLocalSave
          ? parseState(userLocalSave)
          : mayImportLegacy ? parseState(legacySave) : initialState;
      }
      if (cancelled) return;
      setData(loadedState);
      localStorage.setItem(LOCAL_OWNER_KEY, user.id);
      localStorage.setItem(`${STORAGE_KEY}:${user.id}`, JSON.stringify(loadedState));
      setLoadedUserId(user.id);
    })();
    return () => { cancelled = true; };
  }, [authReady, user?.id]);

  useEffect(() => {
    if (!user || loadedUserId !== user.id) return;
    const serialized = JSON.stringify(data);
    localStorage.setItem(`${STORAGE_KEY}:${user.id}`, serialized);
    localStorage.setItem(LOCAL_OWNER_KEY, user.id);
    const timeout = window.setTimeout(async () => {
      const { error } = await supabase.from("game_saves").upsert({
        user_id: user.id,
        game_state: data,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (error) setSyncError(`Cloud save failed: ${error.message}`);
      else setSyncError("");
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [data, user?.id, loadedUserId]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      if (authMode === "signup") {
        const { data: result, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        if (!result.session) setAuthMessage("Account created. Check your email to confirm your account, then log in.");
        else setAuthMessage("Account created successfully.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setLoadedUserId(null);
    setScreen("home");
  }

  const quests = data.quests;
  const inPool = (pool: Pool) => quests.filter(q => q.pool === pool);
  const inbox = inPool("inbox");
  const active = inPool("active");
  const projects = inPool("projects");
  const rewardPool = inPool("rewards");
  const locked = inPool("locked");
  const ongoing = inPool("ongoing");
  const rewardOngoing = inPool("rewardOngoing");
  const ordinarySlotsLeft = Math.max(0, MAX_ONGOING - ongoing.length);

  const projectBeingPlanned = useMemo(
    () => projects.find(q => q.id === planProjectId) ?? null,
    [projects, planProjectId]
  );

  function updateQuest(id: string, updates: Partial<Quest>) {
    setData(prev => ({ ...prev, quests: prev.quests.map(q => q.id === id ? { ...q, ...updates } : q) }));
  }

  function addQuest(title: string, pool: Pool, extra: Partial<Quest> = {}) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const quest: Quest = { id: makeId(), title: trimmed, createdAt: Date.now(), pool, ...extra };
    setData(prev => ({ ...prev, quests: [...prev.quests, quest] }));
  }

  function deleteQuest(id: string) {
    setData(prev => {
      const removeIds = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        prev.quests.forEach(q => {
          if (q.dependsOn && removeIds.has(q.dependsOn) && !removeIds.has(q.id)) {
            removeIds.add(q.id);
            changed = true;
          }
        });
      }
      return { ...prev, quests: prev.quests.filter(q => !removeIds.has(q.id)) };
    });
  }

  function capture() {
    if (!captureText.trim()) return;
    addQuest(captureText, "inbox");
    setCaptureText("");
    setNotice("Captured and safely tucked away.");
    window.setTimeout(() => setNotice(""), 2200);
  }

  function moveToPool(id: string, pool: Pool) {
    updateQuest(id, { pool });
  }

  function handleDrop(pool: Pool) {
    if (!draggedId) return;
    moveToPool(draggedId, pool);
    setDraggedId(null);
  }

  function addToLogbook(quest: Quest) {
    if (ongoing.length >= MAX_ONGOING) {
      setNotice(`Your logbook is full (${MAX_ONGOING} ordinary quests). Complete one first.`);
      window.setTimeout(() => setNotice(""), 2800);
      return;
    }
    updateQuest(quest.id, { pool: "ongoing" });
  }

  function completeQuest(quest: Quest) {
    if (completingIds.includes(quest.id)) return;
    setCompletingIds(prev => [...prev, quest.id]);
    window.setTimeout(() => {
      setData(prev => {
        const followUps = prev.quests
          .filter(q => q.pool === "locked" && q.dependsOn === quest.id)
          .map(q => ({ ...q, pool: "ongoing" as Pool, dependsOn: undefined }));
        const followUpIds = new Set(followUps.map(q => q.id));
        const nextQuests: Quest[] = [];
        prev.quests.forEach(q => {
          if (q.id === quest.id) nextQuests.push(...followUps);
          else if (!followUpIds.has(q.id)) nextQuests.push(q);
        });
        return {
          ...prev,
          quests: nextQuests.filter(q => q.id !== quest.id),
          tokens: prev.tokens + 1,
          completedCount: prev.completedCount + 1
        };
      });
      setCompletingIds(prev => prev.filter(id => id !== quest.id));
      const count = data.quests.filter(q => q.pool === "locked" && q.dependsOn === quest.id).length;
      setNotice(count ? `Quest complete! +1 token. ${count} follow-up quest${count > 1 ? "s" : ""} unlocked.` : "Quest complete! +1 token.");
      window.setTimeout(() => setNotice(""), 2800);
    }, 420);
  }

  function completeReward(quest: Quest) {
    if (completingIds.includes(quest.id)) return;
    setCompletingIds(prev => [...prev, quest.id]);
    window.setTimeout(() => {
      setData(prev => ({
        ...prev,
        quests: prev.quests.filter(q => q.id !== quest.id),
        tokens: prev.tokens + 1,
        completedCount: prev.completedCount + 1
      }));
      setCompletingIds(prev => prev.filter(id => id !== quest.id));
      setNotice("Reward quest complete! +1 token.");
      window.setTimeout(() => setNotice(""), 2200);
    }, 420);
  }

  function unlockReward(quest: Quest) {
    if (data.tokens < 50) {
      setNotice("You need 50 tokens to unlock a reward quest.");
      window.setTimeout(() => setNotice(""), 2400);
      return;
    }
    setData(prev => ({
      ...prev,
      tokens: prev.tokens - 50,
      quests: prev.quests.map(q => q.id === quest.id ? { ...q, pool: "rewardOngoing", isReward: true } : q)
    }));
    setNotice("Reward unlocked and added to your logbook!");
    window.setTimeout(() => setNotice(""), 2200);
  }

  function openPlan(project: Quest) {
    setPlanProjectId(project.id);
    setNextActionText("");
    setFollowUpInputs({});
    setActiveModal("plan");
  }

  function addNextAction() {
    if (!projectBeingPlanned || !nextActionText.trim()) return;
    addQuest(nextActionText, "active", { projectId: projectBeingPlanned.id });
    setNextActionText("");
  }

  function addFollowUp(parentId: string) {
    const text = (followUpInputs[parentId] ?? "").trim();
    if (!projectBeingPlanned || !text) return;
    addQuest(text, "locked", { dependsOn: parentId, projectId: projectBeingPlanned.id });
    setFollowUpInputs(prev => ({ ...prev, [parentId]: "" }));
  }

  function finishPlanning() {
    if (planProjectId) {
      setData(prev => ({ ...prev, quests: prev.quests.filter(q => q.id !== planProjectId) }));
    }
    setActiveModal(null);
    setPlanProjectId(null);
  }

  function renderPlanNode(quest: Quest, depth = 0): React.ReactNode {
    const children = quests.filter(q => q.projectId === projectBeingPlanned?.id && q.dependsOn === quest.id && q.pool === "locked").sort((a, b) => a.createdAt - b.createdAt);
    return <div className="plan-tree-node" key={quest.id} style={{ marginLeft: depth ? 15 : 0 }}>
      {depth > 0 && <span className="plan-tree-arrow" aria-hidden="true">↳</span>}
      <div className={`mini-quest ${quest.pool === "locked" ? "locked-mini" : ""}`}>
        <span className={`quest-dot ${quest.pool === "locked" ? "muted-dot" : "blue-dot"}`} />
        <span>{quest.title}</span>
        <button className="mini-delete" onClick={() => deleteQuest(quest.id)} aria-label={`Delete ${quest.title}`}><X size={14} /></button>
      </div>
      <div className="followup-inline-form">
        <input value={followUpInputs[quest.id] ?? ""} onChange={e => setFollowUpInputs(prev => ({ ...prev, [quest.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") addFollowUp(quest.id); }} placeholder="Add follow-up quest…" aria-label={`Add follow-up to ${quest.title}`} />
        <button className="primary-button square-button" onClick={() => addFollowUp(quest.id)} disabled={!(followUpInputs[quest.id] ?? "").trim()} aria-label={`Add follow-up to ${quest.title}`}><Plus size={16} /></button>
      </div>
      {children.map(child => renderPlanNode(child, depth + 1))}
    </div>;
  }

  function selectSlot(index: number) {
    setSlotIndex(index);
    setActiveModal("slot");
  }

  function fillSlot(questId: string) {
    const quest = active.find(q => q.id === questId);
    if (!quest || slotIndex === null || ongoing.length >= MAX_ONGOING) return;
    updateQuest(quest.id, { pool: "ongoing" });
    setActiveModal(null);
    setSlotIndex(null);
  }

  if (!authReady) return <div className="auth-page"><div className="auth-card"><div className="auth-logo"><Compass size={26} /></div><h1>DreamQuests</h1><p className="auth-intro">Connecting to your account…</p></div></div>;

  if (!user) return <AuthScreen mode={authMode} setMode={mode => { setAuthMode(mode); setAuthError(""); setAuthMessage(""); }} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} busy={authBusy} error={authError} message={authMessage} onSubmit={submitAuth} />;

  if (loadedUserId !== user.id) return <div className="auth-page"><div className="auth-card"><div className="auth-logo"><Compass size={26} /></div><h1>DreamQuests</h1><p className="auth-intro">{gameLoadError || "Loading your saved quests…"}</p>{gameLoadError && <button className="primary-button auth-submit" onClick={() => window.location.reload()}>Try again</button>}<button className="auth-text-button" onClick={signOut}>Log out</button></div></div>;

  return (
    <div className="app-shell">
      <div className="phone-frame">
        {screen === "home" ? (
          <main className="screen home-screen">
            <header className="home-header">
              <div className="brand-mark"><Compass size={23} /></div>
              <div className="brand-copy"><h1>DreamQuests<span>.</span></h1></div>
              <div className="home-header-actions"><div className="token-pill"><CircleDollarSign size={17} /><strong>{data.tokens}</strong></div><button className="signout-button" onClick={signOut} aria-label="Log out" title={user.email ?? "Log out"}><LogOut size={17} /></button></div>
            </header>
            <div className="section-heading"><div><h2>Your quest board</h2></div></div>
            <div className="home-grid">
              {navItems.map(item => {
                const Icon = item.icon;
                const count = item.id === "capture" ? inbox.length : item.id === "sort" ? inbox.length + projects.length : item.id === "plan" ? projects.length : item.id === "quests" ? active.length : item.id === "logbook" ? ongoing.length + rewardOngoing.length : rewardPool.length;
                return <button className="home-tile" key={item.id} onClick={() => setScreen(item.id)}>
                  <span className={`tile-icon-wrap ${item.color}`}><span className="tile-icon"><Icon size={23} strokeWidth={1.9} /></span>{count > 0 && <span className="notification-badge">{count}</span>}</span>
                  <span className="tile-label">{item.label}</span>
                </button>;
              })}
            </div>
          </main>
        ) : (
          <main className="screen sub-screen">
            <header className="screen-header">
              <button className="back-button" onClick={() => { setScreen("home"); setActiveModal(null); }} aria-label="Back to home"><ArrowLeft size={20} /></button>
              <div className="screen-heading-copy"><h1>{screenInfo[screen].title}</h1></div>
              <div className="header-token"><CircleDollarSign size={15} /> {data.tokens}</div>
            </header>

            {screen === "capture" && <section className="content-section">
              <Card className="capture-card">
                <textarea id="capture-input" value={captureText} onChange={e => setCaptureText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) capture(); }} placeholder="A task, an idea, a reminder, a someday plan…" rows={4} />
                <div className="form-footer"><span></span><button className="primary-button" onClick={capture} disabled={!captureText.trim()}><Plus size={17} /> Capture</button></div>
              </Card>
              {notice && <div className="inline-notice">{notice}</div>}
              <div className="section-heading compact"><div><span className="eyebrow">YOUR INBOX</span><h2>Waiting to be sorted <span className="count-bubble">{inbox.length}</span></h2></div></div>
              {inbox.length === 0 ? <EmptyState title="A clear head feels good" detail="Captured thoughts will show up here." /> : <div className="quest-stack">{inbox.map(q => <QuestCard key={q.id} quest={q} onDelete={deleteQuest} />)}</div>}
            </section>}

            {screen === "sort" && <section className="content-section">
              <div className="section-heading compact"><div><span className="eyebrow">STEP 1 OF 2</span><h2>Unsorted thoughts <span className="count-bubble">{inbox.length}</span></h2></div><span className="small-muted">Drag a card ↓</span></div>
              {inbox.length === 0 ? <EmptyState title="Inbox zero!" detail="Capture something new or enjoy the breathing room." /> :
                <div className="quest-stack">{inbox.map(q => <div key={q.id} draggable onClick={() => setDraggedId(q.id)} onDragStart={() => setDraggedId(q.id)} onDragEnd={() => setDraggedId(null)} className={`quest-card draggable ${draggedId === q.id ? "dragging" : ""}`}><span className="drag-grip">⠿</span><span className="quest-title">{q.title}</span><button className="icon-button danger" onClick={() => deleteQuest(q.id)} aria-label="Delete quest"><Trash2 size={16} /></button></div>)}</div>}
              <div className="section-heading compact bucket-title"><div><span className="eyebrow">STEP 2 OF 2</span><h2>Drop into a bucket</h2></div></div>
              <div className="bucket-grid">
                <DropBucket title="Action" description="Do it soon" color="blue" icon={<ListTodo size={21} />} count={active.length} onDrop={() => handleDrop("active")} onClick={() => draggedId && handleDrop("active")} />
                <DropBucket title="Project" description="Needs a plan" color="mint" icon={<Compass size={21} />} count={projects.length} onDrop={() => handleDrop("projects")} onClick={() => draggedId && handleDrop("projects")} />
                <DropBucket title="Reward" description="Worth saving for" color="gold" icon={<Gift size={21} />} count={rewardPool.length} onDrop={() => handleDrop("rewards")} onClick={() => draggedId && handleDrop("rewards")} />
              </div>
              <p className="helper-text center">On a touch screen, tap a quest then tap a bucket.</p>
              {notice && <div className="inline-notice">{notice}</div>}
            </section>}

            {screen === "plan" && <section className="content-section">
              <div className="section-heading compact"><div><span className="eyebrow">PROJECT WORKSHOP</span><h2>Projects to plan <span className="count-bubble">{projects.length}</span></h2></div></div>
              {projects.length === 0 ? <EmptyState title="Nothing on the drawing board" detail="Sort an item into Project to plan it here." /> : <div className="quest-stack">{projects.map(q => <button className="project-card" key={q.id} onClick={() => openPlan(q)}><span className="project-icon"><Compass size={19} /></span><span className="project-copy"><strong>{q.title}</strong><small>{quests.filter(x => x.projectId === q.id && x.pool === "active").length} next actions · {quests.filter(x => x.projectId === q.id && x.pool === "locked").length} locked follow-ups</small></span><span className="chevron">›</span></button>)}</div>}
            </section>}

            {screen === "quests" && <section className="content-section">
              <Card className="capacity-card"><div><span className="eyebrow">LOGBOOK CAPACITY</span><strong>{ongoing.length} / {MAX_ONGOING} slots used</strong></div><div className="capacity-track"><span style={{ width: `${Math.min(100, ongoing.length / MAX_ONGOING * 100)}%` }} /></div><small>{ordinarySlotsLeft} ordinary slots available</small></Card>
              <div className="section-heading compact"><div><span className="eyebrow">READY FOR ACTION</span><h2>Active quests <span className="count-bubble">{active.length}</span></h2></div></div>
              {active.length === 0 ? <EmptyState title="No active quests yet" detail="Capture and sort a thought, or plan a project." /> : <div className="quest-stack">{active.map(q => {
                const children = locked.filter(l => l.dependsOn === q.id);
                const isExpanded = expanded.includes(q.id);
                return <div className="quest-group" key={q.id}><div className="quest-card"><span className="quest-dot blue-dot" /><span className="quest-title">{q.title}</span>{children.length > 0 && <button className={`expand-button ${isExpanded ? "open" : ""}`} onClick={() => setExpanded(prev => isExpanded ? prev.filter(id => id !== q.id) : [...prev, q.id])} aria-label="Show follow-up quests"><ChevronDown size={18} /></button>}<button className="add-button" onClick={() => addToLogbook(q)} disabled={ordinarySlotsLeft === 0} title="Add to logbook"><Plus size={18} /></button></div>{isExpanded && children.map(child => <div className="locked-card" key={child.id}><span className="lock-symbol">⌑</span><span>{child.title}</span><small>Locked</small></div>)}</div>;
              })}</div>}
              {notice && <div className="inline-notice">{notice}</div>}
            </section>}

            {screen === "logbook" && <section className="content-section">
              <Card className="logbook-summary"><div className="summary-stat"><span className="eyebrow">IN PROGRESS</span><strong>{ongoing.length + rewardOngoing.length}</strong><small>quests in your book</small></div><div className="summary-divider" /><div className="summary-stat"><span className="eyebrow">COMPLETED</span><strong>{data.completedCount}</strong><small>quests conquered</small></div></Card>
              <div className="section-heading compact"><div><span className="eyebrow">YOUR CURRENT ADVENTURES</span><h2>Ongoing quests</h2></div><span className="small-muted">{ongoing.length}/{MAX_ONGOING} slots</span></div>
              {ongoing.length === 0 ? <EmptyState title="Your next chapter awaits" detail="Add an active quest from Quest list, or fill an empty slot below." /> : <div className="quest-stack">{ongoing.map(q => {
                const children = locked.filter(child => child.dependsOn === q.id);
                const completing = completingIds.includes(q.id);
                return <div className={`logbook-quest-group ${completing ? "is-completing" : ""}`} key={q.id}>
                  <div className={`logbook-quest ${completing ? "quest-completing" : ""}`}><span className="completion-ring" /><span className="quest-title">{q.title}</span><button className="complete-button" onClick={() => completeQuest(q)} disabled={completing} aria-label={`Complete ${q.title}`}><Check size={18} /><span className="completion-stars" aria-hidden="true">✦ ✧</span></button></div>
                  {children.map(child => <div className={`logbook-followup ${completing ? "followup-promoting" : ""}`} key={child.id}><span>↳</span>{child.title}</div>)}
                </div>;
              })}</div>}
              {ordinarySlotsLeft > 0 && <div className="empty-slots"><div className="slots-label">EMPTY SLOTS <span>{ordinarySlotsLeft} available</span></div><div className="slot-grid">{Array.from({ length: ordinarySlotsLeft }, (_, i) => <button className="empty-slot" key={i} onClick={() => selectSlot(i)}><Plus size={17} /><span>Choose a quest</span></button>)}</div></div>}
              {rewardOngoing.length > 0 && <><div className="section-heading compact reward-heading"><div><span className="eyebrow">BONUS ADVENTURES</span><h2>Reward quests <span className="count-bubble gold-count">{rewardOngoing.length}</span></h2></div></div><div className="quest-stack">{rewardOngoing.map(q => { const completing = completingIds.includes(q.id); return <div className={`logbook-quest reward-quest ${completing ? "quest-completing" : ""}`} key={q.id}><span className="completion-ring gold-ring" /><span className="quest-title">{q.title}</span><span className="reward-tag">REWARD</span><button className="complete-button reward-complete" onClick={() => completeReward(q)} disabled={completing} aria-label={`Complete reward ${q.title}`}><Check size={18} /><span className="completion-stars" aria-hidden="true">✦ ✧</span></button></div>; })}</div></>}
              {notice && <div className="inline-notice">{notice}</div>}
            </section>}

            {screen === "rewards" && <section className="content-section">
              <Card className="token-banner"><div className="token-coin"><CircleDollarSign size={30} /></div><div><span className="eyebrow light">YOUR TOKEN WALLET</span><strong>{data.tokens} <small>tokens</small></strong><p>Every completed quest earns 1 token.</p></div><div className="banner-sparkle"><Sparkles size={24} /></div></Card>
              <div className="section-heading compact"><div><span className="eyebrow">SAVE UP & UNLOCK</span><h2>Reward quests <span className="count-bubble gold-count">{rewardPool.length}</span></h2></div></div>
              {rewardPool.length === 0 ? <EmptyState title="Dream up a reward" detail="Capture something you'd love to do, then sort it into Reward." /> : <div className="quest-stack">{rewardPool.map(q => <div className="reward-store-card" key={q.id}><div className="reward-store-icon"><Gift size={21} /></div><div className="reward-store-copy"><strong>{q.title}</strong><span>Unlock for 50 tokens</span></div><button className="unlock-button" onClick={() => unlockReward(q)} disabled={data.tokens < 50}><CircleDollarSign size={15} /> 50</button></div>)}</div>}
              {notice && <div className="inline-notice">{notice}</div>}
            </section>}
            {syncError && <div className="sync-error" role="status">{syncError}</div>}
            <footer className="screen-footer"><span>DREAMQUESTS</span><span>Made for your next small step ✦</span></footer>
          </main>
        )}
        <nav className="bottom-nav" aria-label="Main navigation">
          <button className={screen === "home" ? "selected" : ""} onClick={() => setScreen("home")}><Home size={19} /><span>Home</span></button>
          <button className={screen === "capture" ? "selected" : ""} onClick={() => setScreen("capture")}><Sparkles size={19} /><span>Capture</span></button>
          <button className={screen === "sort" ? "selected" : ""} onClick={() => setScreen("sort")}><Layers3 size={19} /><span>Sort</span>{inbox.length + projects.length > 0 && <span className="nav-badge">{inbox.length + projects.length}</span>}</button>
          <button className={screen === "logbook" ? "selected" : ""} onClick={() => setScreen("logbook")}><BookOpen size={19} /><span>Logbook</span></button>
        </nav>

        {activeModal === "plan" && projectBeingPlanned && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setActiveModal(null); }}>
          <div className="modal-sheet plan-modal">
            <div className="modal-handle" /><div className="modal-top"><div><span className="eyebrow">PROJECT PLANNING</span><h2>{projectBeingPlanned.title}</h2></div><button className="icon-button" onClick={() => setActiveModal(null)} aria-label="Close"><X size={20} /></button></div>
            <div className="modal-scroll">
              <div className="modal-section"><h3>Next actions</h3><div className="inline-form"><input value={nextActionText} onChange={e => setNextActionText(e.target.value)} onKeyDown={e => e.key === "Enter" && addNextAction()} placeholder="Add a next action…" /><button className="primary-button square-button" onClick={addNextAction} disabled={!nextActionText.trim()}><Plus size={18} /></button></div>
                <div className="plan-tree">{quests.filter(q => q.projectId === projectBeingPlanned.id && q.pool === "active" && !q.dependsOn).sort((a, b) => a.createdAt - b.createdAt).map(q => renderPlanNode(q))}</div>
              </div>
            </div>
            <button className="primary-button modal-done" onClick={finishPlanning}>Done planning <Check size={17} /></button>
          </div>
        </div>}

        {activeModal === "slot" && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setActiveModal(null); }}>
          <div className="modal-sheet slot-modal"><div className="modal-handle" /><div className="modal-top"><div><span className="eyebrow">EMPTY LOGBOOK SLOT</span><h2>Choose your next quest</h2><p>Pick one from your active quest pool.</p></div><button className="icon-button" onClick={() => setActiveModal(null)} aria-label="Close"><X size={20} /></button></div>
            {active.length === 0 ? <EmptyState title="No active quests available" detail="Capture and sort something first." /> : <div className="slot-quest-list">{active.map(q => <button className="slot-quest-option" key={q.id} onClick={() => fillSlot(q.id)}><span className="quest-dot blue-dot" /><span>{q.title}</span><Plus size={17} /></button>)}</div>}
          </div>
        </div>}
      </div>
    </div>
  );
}

function QuestCard({ quest, onDelete }: { quest: Quest; onDelete: (id: string) => void }) {
  return <div className="quest-card"><span className="quest-dot lavender-dot" /><span className="quest-title">{quest.title}</span><button className="icon-button danger" onClick={() => onDelete(quest.id)} aria-label="Delete quest"><Trash2 size={16} /></button></div>;
}

function DropBucket({ title, description, color, icon, count, onDrop, onClick }: { title: string; description: string; color: string; icon: React.ReactNode; count: number; onDrop: () => void; onClick: () => void }) {
  const [over, setOver] = useState(false);
  return <button className={`drop-bucket ${color} ${over ? "drag-over" : ""}`} onClick={onClick} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); onDrop(); }}>
    <span className="bucket-icon">{icon}</span><strong>{title}</strong><small>{description}</small><span className="bucket-count">{count} stored</span>
  </button>;
}
