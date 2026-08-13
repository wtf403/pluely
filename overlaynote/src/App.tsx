import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, SlidersHorizontal, X, ChevronDown, ChevronUp } from "lucide-react";
import { CustomCursor } from "./CustomCursor";
import { Settings } from "./Settings";
import "./App.css";

interface Note {
  id: number;
  text: string;
  ts: number;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [opacity, setOpacity] = useState(0.92);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  // Load opacity from backend
  useEffect(() => {
    invoke<number>("get_opacity")
      .then(setOpacity)
      .catch(() => {});
  }, []);

  // Re-sync opacity whenever settings close
  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    invoke<number>("get_opacity")
      .then(setOpacity)
      .catch(() => {});
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-focus input when window gains focus
  useEffect(() => {
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      // Save note
      const note: Note = { id: nextId.current++, text: query.trim(), ts: Date.now() };
      setNotes((prev) => [note, ...prev]);
      setQuery("");
      if (!expanded) toggleExpand();
    }
    if (e.key === "Escape") {
      setQuery("");
    }
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    invoke("set_window_expanded", { expanded: next }).catch(() => {});
  };

  const deleteNote = (id: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const filtered = query
    ? notes.filter((n) => n.text.toLowerCase().includes(query.toLowerCase()))
    : notes;

  return (
    <div className="root" style={{ "--opacity": opacity } as React.CSSProperties}>
      <CustomCursor />

      {/* Drag bar at the very top */}
      <div className="drag-bar" data-tauri-drag-region />

      {/* Search bar row */}
      <div className="search-row">
        <Search className="search-icon" size={15} />
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search or type a note… (Enter to save)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        {query && (
          <button className="icon-btn" onClick={() => setQuery("")} title="Clear">
            <X size={13} />
          </button>
        )}
        <button
          className="icon-btn"
          onClick={() => setShowSettings((s) => !s)}
          title="Settings"
        >
          <SlidersHorizontal size={14} />
        </button>
        <button
          className="icon-btn"
          onClick={toggleExpand}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Notes list — only visible when expanded */}
      {expanded && (
        <div className="notes-area">
          {filtered.length === 0 ? (
            <p className="empty-hint">
              {notes.length === 0
                ? "Type and press Enter to add a note"
                : "No notes match"}
            </p>
          ) : (
            filtered.map((note) => (
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

      {/* Settings overlay */}
      {showSettings && <Settings onClose={handleSettingsClose} />}
    </div>
  );
}
