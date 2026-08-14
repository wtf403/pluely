import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Search, SlidersHorizontal, X, ChevronDown, ChevronUp,
  GripVertical, Mic, MicOff, EyeOff,
} from "lucide-react";
import { CustomCursor } from "./CustomCursor";
import { Settings } from "./Settings";
import { useMicSilence } from "./useMicSilence";
import "./App.css";

interface Note {
  id: number;
  text: string;
  ts: number;
}

export default function App() {
  const [query, setQuery]         = useState("");
  const [notes, setNotes]         = useState<Note[]>([]);
  const [expanded, setExpanded]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [opacity, setOpacity]     = useState(0.92);
  const inputRef   = useRef<HTMLInputElement>(null);
  const nextId     = useRef(1);
  const { silenced, toggle: toggleMic } = useMicSilence();

  // Load opacity from backend
  useEffect(() => {
    invoke<number>("get_opacity").then(setOpacity).catch(() => {});
  }, []);

  // Focus input on mount and on window focus
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Listen for Rust "focus-input" event (emitted after show)
  useEffect(() => {
    const unsub = listen("focus-input", () => inputRef.current?.focus());
    return () => { unsub.then(fn => fn()); };
  }, []);

  // keyboard: Enter = save note, Escape = clear
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      const note: Note = { id: nextId.current++, text: query.trim(), ts: Date.now() };
      setNotes(prev => [note, ...prev]);
      setQuery("");
      if (!expanded) {
        setExpanded(true);
        invoke("set_window_expanded", { expanded: true }).catch(() => {});
      }
    }
    if (e.key === "Escape") setQuery("");
  }, [query, expanded]);

  const toggleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    invoke("set_window_expanded", { expanded: next }).catch(() => {});
  }, [expanded]);

  const deleteNote = useCallback((id: number) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    invoke<number>("get_opacity").then(setOpacity).catch(() => {});
  }, []);

  const filtered = query
    ? notes.filter(n => n.text.toLowerCase().includes(query.toLowerCase()))
    : notes;

  return (
    <div className="root" style={{ "--opacity": opacity } as React.CSSProperties}>
      <CustomCursor />

      {/* Transparent drag strip at very top */}
      <div className="drag-bar" data-tauri-drag-region />

      {/* ── Search / toolbar row ── */}
      <div className="search-row">
        {/* Drag handle — same pattern as Builder's DragButton */}
        <button
          className="icon-btn drag-handle"
          data-tauri-drag-region
          title="Drag to move"
          style={{ cursor: "none" }}
        >
          <GripVertical size={14} />
        </button>

        <Search className="search-icon" size={14} />

        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search or type a note… (Enter to save)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
        />

        {query && (
          <button className="icon-btn" onClick={() => setQuery("")} title="Clear (Esc)">
            <X size={12} />
          </button>
        )}

        {/* Mic silence button */}
        <button
          className={`icon-btn${silenced ? " icon-btn--active" : ""}`}
          onClick={toggleMic}
          title={silenced ? "Mic silenced — click to restore" : "Silence mic"}
        >
          {silenced ? <MicOff size={14} /> : <Mic size={14} />}
        </button>

        <button
          className={`icon-btn${showSettings ? " icon-btn--active" : ""}`}
          onClick={() => setShowSettings(s => !s)}
          title="Settings"
        >
          <SlidersHorizontal size={14} />
        </button>

        <button
          className="icon-btn"
          onClick={() => invoke("toggle_window")}
          title="Hide (Alt+\)"
        >
          <EyeOff size={14} />
        </button>

        <button
          className="icon-btn"
          onClick={toggleExpand}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* ── Notes list ── */}
      {expanded && (
        <div className="notes-area">
          {filtered.length === 0 ? (
            <p className="empty-hint">
              {notes.length === 0
                ? "Type something and press Enter to save a note"
                : "No notes match your search"}
            </p>
          ) : (
            filtered.map(note => (
              <div key={note.id} className="note-item">
                <span className="note-text">{note.text}</span>
                <button
                  className="icon-btn delete-btn"
                  onClick={() => deleteNote(note.id)}
                  title="Delete"
                >
                  <X size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Settings overlay ── */}
      {showSettings && (
        <Settings
          onClose={handleSettingsClose}
          opacity={opacity}
          onOpacityChange={setOpacity}
        />
      )}

      {/* Silenced indicator pill */}
      {silenced && (
        <div className="mic-badge" title="Microphone silenced">
          <MicOff size={10} /> silent
        </div>
      )}
    </div>
  );
}
