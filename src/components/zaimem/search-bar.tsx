"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Loader2, MessageSquare, Database, FileText, Zap, CornerDownLeft, SlidersHorizontal } from "lucide-react";
import { fmtDate } from "./panels";

export interface SearchResults {
  q: string;
  sessions: { id: string; title: string; topic: string | null; status: string; turns: number; memories: number; matchIn: string; excerpt: string; updatedAt: string }[];
  memories: { id: string; kind: string; content: string; score: number; sessionId: string | null; sessionTitle: string | null; createdAt: string; accessCount: number }[];
  ledger: { id: string; path: string; sessionId: string | null; sessionTitle: string | null; excerpt: string; updatedAt: string }[];
  skills: { id: string; name: string; description: string; enabled: boolean; excerpt: string }[];
  total: number;
  tookMs: number;
}

export type SearchTarget =
  | { kind: "session"; id: string }
  | { kind: "memory" }
  | { kind: "ledger"; sessionId: string | null }
  | { kind: "skill" };

// result filters (mirrors server-side SearchFilters)
export type SearchKindFilter = "all" | "sessions" | "memories" | "ledger" | "skills";
export type SearchRangeFilter = "all" | "24h" | "7d" | "30d" | "90d" | "365d";

const KIND_CHIPS: { value: SearchKindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sessions", label: "Sessions" },
  { value: "memories", label: "Memories" },
  { value: "ledger", label: "Ledger" },
  { value: "skills", label: "Skills" },
];
const RANGE_CHIPS: { value: SearchRangeFilter; label: string }[] = [
  { value: "all", label: "Any time" },
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
  { value: "90d", label: "90 d" },
  { value: "365d", label: "1 y" },
];

interface GlobalSearchProps {
  token: string;
  /** navigate the dashboard to the right tab (and optionally open a session) */
  onNavigate: (target: SearchTarget) => void;
}

export function GlobalSearch({ token, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKindFilter>("all");
  const [range, setRange] = useState<SearchRangeFilter>("all");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const filtersActive = kind !== "all" || range !== "all";
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);
  const latestRef = useRef("");

  // click-outside + esc close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // debounced search
  useEffect(() => {
    const q = query.trim();
    latestRef.current = q;
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&kind=${kind}&range=${range}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (seq === seqRef.current && latestRef.current === q) {
          setResults(res.ok ? (data as SearchResults) : null);
          setOpen(true);
        }
      } catch {
        if (seq === seqRef.current) setResults(null);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 260);
    return () => clearTimeout(t);
  }, [query, token, kind, range]);

  const go = useCallback(
    (target: SearchTarget) => {
      setOpen(false);
      onNavigate(target);
    },
    [onNavigate],
  );

  const has = results && results.total > 0;

  return (
    <div ref={boxRef} className="relative order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-sm">
      <div className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 transition-colors focus-within:border-violet-500/40">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-400" />
        ) : (
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          placeholder="Search everything…"
          aria-label="Search sessions, memories, ledger and skills"
          className="h-full w-full bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
        />
        {filtersActive && <SlidersHorizontal className="h-3 w-3 shrink-0 text-violet-400" aria-hidden />}
        <kbd className="hidden shrink-0 rounded border border-white/10 bg-black/40 px-1 font-mono text-[9px] text-zinc-500 sm:block">⌘K</kbd>
      </div>

      <AnimatePresence>
        {open && (query.trim().length >= 2) && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full z-40 mt-2 max-h-[62vh] w-[min(92vw,460px)] overflow-y-auto rounded-xl border border-white/10 bg-[#0d0d14]/98 p-2 shadow-2xl shadow-black/60 backdrop-blur-md [scrollbar-color:rgb(113_113_122)_transparent] [scrollbar-width:thin]"
          >
            {/* result filters: kind + date range */}
            <div className="mb-1 flex flex-wrap items-center gap-1 border-b border-white/5 px-2 pb-2 pt-1">
              {KIND_CHIPS.map((c) => (
                <Chip key={c.value} active={kind === c.value} onClick={() => setKind(c.value)}>{c.label}</Chip>
              ))}
              <span className="mx-1 h-3.5 w-px bg-white/10" aria-hidden />
              {RANGE_CHIPS.map((c) => (
                <Chip key={c.value} active={range === c.value} onClick={() => setRange(c.value)}>{c.label}</Chip>
              ))}
            </div>

            {!has && !loading && (
              <p className="px-3 py-6 text-center text-xs text-zinc-500">
                {results
                  ? filtersActive
                    ? "No matches with the current filters — try widening the type or date range."
                    : "No matches across your sessions, memories, ledger or skills."
                  : "Type at least 2 characters."}
              </p>
            )}

            {has && (results!.sessions.length > 0) && (
              <Group icon={<MessageSquare className="h-3 w-3" />} label="Sessions">
                {results!.sessions.map((s) => (
                  <ResultRow key={s.id} onClick={() => go({ kind: "session", id: s.id })} title={s.title} hint={`${s.memories} memories · ${s.turns} turns · ${fmtDate(s.updatedAt)}`} excerpt={s.excerpt} />
                ))}
              </Group>
            )}

            {has && (results!.memories.length > 0) && (
              <Group icon={<Database className="h-3 w-3" />} label="Memories">
                {results!.memories.map((m) => (
                  <ResultRow
                    key={m.id}
                    onClick={() => go({ kind: "memory" })}
                    title={m.sessionTitle ?? `[${m.kind}]`}
                    hint={`[${m.kind}] ×${m.accessCount}`}
                    excerpt={m.content.replace(/\s+/g, " ")}
                  />
                ))}
              </Group>
            )}

            {has && (results!.ledger.length > 0) && (
              <Group icon={<FileText className="h-3 w-3" />} label="Ledger">
                {results!.ledger.map((p) => (
                  <ResultRow
                    key={p.id}
                    onClick={() => go({ kind: "ledger", sessionId: p.sessionId })}
                    title={p.sessionTitle ?? p.path}
                    hint={p.path}
                    excerpt={p.excerpt}
                  />
                ))}
              </Group>
            )}

            {has && (results!.skills.length > 0) && (
              <Group icon={<Zap className="h-3 w-3" />} label="Skills">
                {results!.skills.map((k) => (
                  <ResultRow key={k.id} onClick={() => go({ kind: "skill" })} title={k.name} hint={k.enabled ? "enabled" : "disabled"} excerpt={k.excerpt} />
                ))}
              </Group>
            )}

            {has && (
              <p className="flex items-center justify-center gap-1.5 border-t border-white/5 px-3 py-2 text-[10px] text-zinc-600">
                <CornerDownLeft className="h-3 w-3" /> {results!.total} result{results!.total === 1 ? "" : "s"} in {results!.tookMs} ms
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2 py-0.5 text-[10px] leading-4 transition-colors ${
        active
          ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
          : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function Group({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {icon} {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ResultRow({ onClick, title, hint, excerpt }: { onClick: () => void; title: string; hint: string; excerpt: string }) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-zinc-200">{title}</span>
        <span className="shrink-0 text-[9px] text-zinc-600">{hint}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{excerpt}</p>
    </button>
  );
}
