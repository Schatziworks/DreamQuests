import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BookOpen, Check, ChevronDown, CircleDollarSign,
  Compass, Gift, Home, Layers3, ListTodo, Plus, Sparkles, Trash2, X
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

const STORAGE_KEY = "questbook-state-v1";
const MAX_ONGOING = 25;

const initialState: AppState = { quests: [], tokens: 0, completedCount: 0 };

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
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

export default function App() {
  const [data, setData] = useState<AppState>(loadState);
  const [screen, setScreen] = useState<Screen>("home");
  const [captureText, setCaptureText] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [planProjectId, setPlanProjectId] = useState<string | null>(null);
  const [nextActionText, setNextActionText] = useState("");
  const [followUpText, setFollowUpText] = useState("");
  const [followUpParentId, setFollowUpParentId] = useState("");
  const [activeModal, setActiveModal] = useState<"plan" | "slot" | null>(null);
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

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
    setData(prev => ({
      ...prev,
      quests: prev.quests.filter(q => q.id !== id && q.dependsOn !== id)
    }));
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
    const followUps = locked.filter(q => q.dependsOn === quest.id);
    setData(prev => {
      let nextQuests = prev.quests.filter(q => q.id !== quest.id);
      if (followUps.length > 0) {
        const followIds = new Set(followUps.map(q => q.id));
        nextQuests = nextQuests.map(q => followIds.has(q.id) ? { ...q, pool: "ongoing", dependsOn: undefined } : q);
      }
      return { ...prev, quests: nextQuests, tokens: prev.tokens + 1, completedCount: prev.completedCount + 1 };
    });
    setNotice(followUps.length ? `Quest complete! +1 token. ${followUps.length} follow-up quest${followUps.length > 1 ? "s" : ""} unlocked.` : "Quest complete! +1 token.");
    window.setTimeout(() => setNotice(""), 2800);
  }

  function completeReward(quest: Quest) {
    setData(prev => ({
      ...prev,
      quests: prev.quests.filter(q => q.id !== quest.id),
      tokens: prev.tokens + 1,
      completedCount: prev.completedCount + 1
    }));
    setNotice("Reward quest complete! +1 token.");
    window.setTimeout(() => setNotice(""), 2200);
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
    setFollowUpText("");
    setFollowUpParentId("");
    setActiveModal("plan");
  }

  function addNextAction() {
    if (!projectBeingPlanned || !nextActionText.trim()) return;
    addQuest(nextActionText, "active", { projectId: projectBeingPlanned.id });
    setNextActionText("");
  }

  function addFollowUp() {
    if (!projectBeingPlanned || !followUpText.trim() || !followUpParentId) return;
    addQuest(followUpText, "locked", { dependsOn: followUpParentId, projectId: projectBeingPlanned.id });
    setFollowUpText("");
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

  return (
    <div className="app-shell">
      <div className="phone-frame">
        <div className="status-bar"><span>9:41</span><span className="status-right"><span className="signal">▮▮▮</span><span>Wi-Fi</span><span className="battery"><i /></span></span></div>
        {screen === "home" ? (
          <main className="screen home-screen">
            <header className="home-header">
              <div className="brand-mark"><Compass size={23} /></div>
              <div className="brand-copy"><span className="eyebrow">YOUR PERSONAL ADVENTURE</span><h1>Questbook<span>.</span></h1></div>
              <div className="token-pill"><CircleDollarSign size={17} /><strong>{data.tokens}</strong></div>
            </header>
            <Card className="welcome-card">
              <div className="welcome-text"><span className="eyebrow light">READY WHEN YOU ARE</span><h2>Small steps.<br />Epic progress.</h2><p>One quest at a time.</p></div>
              <div className="welcome-art"><div className="art-sun" /><div className="art-mountain one" /><div className="art-mountain two" /><div className="art-path" /><Sparkles className="art-star" size={18} /></div>
            </Card>
            <div className="section-heading"><div><span className="eyebrow">THE ADVENTURE STARTS HERE</span><h2>Your quest board</h2></div><span className="small-muted">6 tools</span></div>
            <div className="home-grid">
              {navItems.map(item => {
                const Icon = item.icon;
                const count = item.id === "capture" ? inbox.length : item.id === "sort" ? inbox.length : item.id === "plan" ? projects.length : item.id === "quests" ? active.length : item.id === "logbook" ? ongoing.length + rewardOngoing.length : rewardPool.length;
                return <button className="home-tile" key={item.id} onClick={() => setScreen(item.id)}>
                  <span className={`tile-icon ${item.color}`}><Icon size={23} strokeWidth={1.9} /></span>
                  <span className="tile-label">{item.label}</span><span className="tile-description">{item.description}</span>
                  <span className="tile-count">{count} {count === 1 ? "item" : "items"} <span>↗</span></span>
                </button>;
              })}
            </div>
            <Card className="progress-card">
              <div className="progress-icon"><Sparkles size={18} /></div>
              <div className="progress-copy"><strong>Your journey so far</strong><span>{data.completedCount} quests completed</span></div>
              <div className="progress-tokens"><CircleDollarSign size={16} /> {data.tokens}</div>
            </Card>
            <p className="home-footnote">Your life, one little quest at a time.</p>
          </main>
        ) : (
          <main className="screen sub-screen">
            <header className="screen-header">
              <button className="back-button" onClick={() => { setScreen("home"); setActiveModal(null); }} aria-label="Back to home"><ArrowLeft size={20} /></button>
              <div className="screen-heading-copy"><span className="eyebrow">QUESTBOOK / {screen.toUpperCase()}</span><h1>{screenInfo[screen].title}</h1><p>{screenInfo[screen].subtitle}</p></div>
              <div className="header-token"><CircleDollarSign size={15} /> {data.tokens}</div>
            </header>

            {screen === "capture" && <section className="content-section">
              <Card className="capture-card">
                <label htmlFor="capture-input" className="field-label">WHAT'S ON YOUR MIND?</label>
                <textarea id="capture-input" value={captureText} onChange={e => setCaptureText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) capture(); }} placeholder="A task, an idea, a reminder, a someday plan…" rows={4} />
                <div className="form-footer"><span className="helper-text">No sorting needed yet. Just capture it.</span><button className="primary-button" onClick={capture} disabled={!captureText.trim()}><Plus size={17} /> Capture</button></div>
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
              <div className="section-heading compact extra-heading"><div><span className="eyebrow">NOT READY YET</span><h2>Locked follow-ups <span className="count-bubble">{locked.length}</span></h2></div></div>
              {locked.length > 0 ? <p className="helper-paragraph">Follow-ups unlock automatically when their preceding quest is completed in the logbook.</p> : <p className="helper-paragraph">No locked quests. Add follow-ups from the Plan screen.</p>}
              {notice && <div className="inline-notice">{notice}</div>}
            </section>}

            {screen === "logbook" && <section className="content-section">
              <Card className="logbook-summary"><div className="summary-stat"><span className="eyebrow">IN PROGRESS</span><strong>{ongoing.length + rewardOngoing.length}</strong><small>quests in your book</small></div><div className="summary-divider" /><div className="summary-stat"><span className="eyebrow">COMPLETED</span><strong>{data.completedCount}</strong><small>quests conquered</small></div></Card>
              <div className="section-heading compact"><div><span className="eyebrow">YOUR CURRENT ADVENTURES</span><h2>Ongoing quests</h2></div><span className="small-muted">{ongoing.length}/{MAX_ONGOING} slots</span></div>
              {ongoing.length === 0 ? <EmptyState title="Your next chapter awaits" detail="Add an active quest from Quest list, or fill an empty slot below." /> : <div className="quest-stack">{ongoing.map(q => <div className="logbook-quest" key={q.id}><span className="completion-ring" /><span className="quest-title">{q.title}</span><button className="complete-button" onClick={() => completeQuest(q)} aria-label={`Complete ${q.title}`}><Check size={18} /></button></div>)}</div>}
              {Array.from({ length: Math.max(0, Math.min(3, ordinarySlotsLeft)) }, (_, i) => i).length > 0 && <div className="empty-slots"><div className="slots-label">EMPTY SLOTS <span>{ordinarySlotsLeft} available</span></div><div className="slot-grid">{Array.from({ length: Math.min(3, ordinarySlotsLeft) }, (_, i) => <button className="empty-slot" key={i} onClick={() => selectSlot(i)}><Plus size={18} /><span>Choose a quest</span></button>)}</div>{ordinarySlotsLeft > 3 && <p className="helper-text">Showing 3 of {ordinarySlotsLeft} available slots.</p>}</div>}
              {rewardOngoing.length > 0 && <><div className="section-heading compact reward-heading"><div><span className="eyebrow">BONUS ADVENTURES</span><h2>Reward quests <span className="count-bubble gold-count">{rewardOngoing.length}</span></h2></div></div><div className="quest-stack">{rewardOngoing.map(q => <div className="logbook-quest reward-quest" key={q.id}><span className="completion-ring gold-ring" /><span className="quest-title">{q.title}</span><span className="reward-tag">REWARD</span><button className="complete-button reward-complete" onClick={() => completeReward(q)} aria-label={`Complete reward ${q.title}`}><Check size={18} /></button></div>)}</div></>}
              {notice && <div className="inline-notice">{notice}</div>}
            </section>}

            {screen === "rewards" && <section className="content-section">
              <Card className="token-banner"><div className="token-coin"><CircleDollarSign size={30} /></div><div><span className="eyebrow light">YOUR TOKEN WALLET</span><strong>{data.tokens} <small>tokens</small></strong><p>Every completed quest earns 1 token.</p></div><div className="banner-sparkle"><Sparkles size={24} /></div></Card>
              <div className="section-heading compact"><div><span className="eyebrow">SAVE UP & UNLOCK</span><h2>Reward quests <span className="count-bubble gold-count">{rewardPool.length}</span></h2></div></div>
              {rewardPool.length === 0 ? <EmptyState title="Dream up a reward" detail="Capture something you'd love to do, then sort it into Reward." /> : <div className="quest-stack">{rewardPool.map(q => <div className="reward-store-card" key={q.id}><div className="reward-store-icon"><Gift size={21} /></div><div className="reward-store-copy"><strong>{q.title}</strong><span>Unlock for 50 tokens</span></div><button className="unlock-button" onClick={() => unlockReward(q)} disabled={data.tokens < 50}><CircleDollarSign size={15} /> 50</button></div>)}</div>}
              {notice && <div className="inline-notice">{notice}</div>}
              <p className="helper-paragraph reward-note">Unlocked rewards appear in a gold slot in your Logbook. They don't use up your 25 regular quest slots, and completing one earns a token back.</p>
            </section>}
            <footer className="screen-footer"><span>QUESTBOOK</span><span>Made for your next small step ✦</span></footer>
          </main>
        )}
        <nav className="bottom-nav" aria-label="Main navigation">
          <button className={screen === "home" ? "selected" : ""} onClick={() => setScreen("home")}><Home size={19} /><span>Home</span></button>
          <button className={screen === "capture" ? "selected" : ""} onClick={() => setScreen("capture")}><Sparkles size={19} /><span>Capture</span></button>
          <button className={screen === "quests" ? "selected" : ""} onClick={() => setScreen("quests")}><ListTodo size={19} /><span>Quests</span></button>
          <button className={screen === "logbook" ? "selected" : ""} onClick={() => setScreen("logbook")}><BookOpen size={19} /><span>Logbook</span></button>
        </nav>
        <div className="home-indicator"><span /></div>

        {activeModal === "plan" && projectBeingPlanned && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setActiveModal(null); }}>
          <div className="modal-sheet plan-modal">
            <div className="modal-handle" /><div className="modal-top"><div><span className="eyebrow">PROJECT PLANNING</span><h2>{projectBeingPlanned.title}</h2></div><button className="icon-button" onClick={() => setActiveModal(null)} aria-label="Close"><X size={20} /></button></div>
            <div className="modal-scroll">
              <div className="modal-section"><h3><span className="number-badge">1</span> Next actions</h3><p>What can you physically do next? Add as many as you need.</p><div className="inline-form"><input value={nextActionText} onChange={e => setNextActionText(e.target.value)} onKeyDown={e => e.key === "Enter" && addNextAction()} placeholder="e.g. Find three venues" /><button className="primary-button square-button" onClick={addNextAction} disabled={!nextActionText.trim()}><Plus size={18} /></button></div>
                {quests.filter(q => q.projectId === projectBeingPlanned.id && q.pool === "active").length > 0 && <div className="modal-quest-list">{quests.filter(q => q.projectId === projectBeingPlanned.id && q.pool === "active").map(q => <div className="mini-quest" key={q.id}><span className="quest-dot blue-dot" />{q.title}<button className="mini-delete" onClick={() => deleteQuest(q.id)}><X size={14} /></button></div>)}</div>}
              </div>
              <div className="modal-section"><h3><span className="number-badge">2</span> Follow-up quests</h3><p>These stay locked until their preceding quest is completed.</p><label className="field-label" htmlFor="parent-select">UNLOCKS AFTER</label><select id="parent-select" value={followUpParentId} onChange={e => setFollowUpParentId(e.target.value)}><option value="">Choose a next action…</option>{quests.filter(q => q.projectId === projectBeingPlanned.id && q.pool === "active").map(q => <option key={q.id} value={q.id}>{q.title}</option>)}</select><div className="inline-form"><input value={followUpText} onChange={e => setFollowUpText(e.target.value)} onKeyDown={e => e.key === "Enter" && addFollowUp()} placeholder="e.g. Book the venue" /><button className="primary-button square-button" onClick={addFollowUp} disabled={!followUpText.trim() || !followUpParentId}><Plus size={18} /></button></div>
                {quests.filter(q => q.projectId === projectBeingPlanned.id && q.pool === "locked").length > 0 && <div className="modal-quest-list">{quests.filter(q => q.projectId === projectBeingPlanned.id && q.pool === "locked").map(q => <div className="mini-quest locked-mini" key={q.id}><span className="lock-symbol">⌑</span><span>{q.title}</span><small>After: {quests.find(p => p.id === q.dependsOn)?.title ?? "previous quest"}</small><button className="mini-delete" onClick={() => deleteQuest(q.id)}><X size={14} /></button></div>)}</div>}
              </div>
            </div>
            <button className="primary-button modal-done" onClick={() => setActiveModal(null)}>Done planning <Check size={17} /></button>
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
