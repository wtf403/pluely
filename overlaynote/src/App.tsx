import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Search, SlidersHorizontal, X,
  GripVertical, Mic, MicOff, EyeOff,
} from "lucide-react";
import { CustomCursor } from "./CustomCursor";
import { Settings } from "./Settings";
import { useMicSilence } from "./useMicSilence";
import "./App.css";

export type Theme = "light" | "dark";

export default function App() {
  const [query, setQuery]               = useState("");
  const [noteText, setNoteText]         = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [opacity, setOpacity]           = useState(1.0);
  const [theme, setTheme]               = useState<Theme>("light");
  const inputRef    = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { silenced, toggle: toggleMic } = useMicSilence();

  // Load settings from backend on mount
  useEffect(() => {
    invoke<number>("get_opacity").then(v => {
      setOpacity(v);
    }).catch(() => {});
    // Persist theme in localStorage
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Focus textarea on mount and window focus
  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => {
    const onFocus = () => textareaRef.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Listen for Rust "focus-input" event (emitted after show)
  useEffect(() => {
    const unsub = listen("focus-input", () => textareaRef.current?.focus());
    return () => { unsub.then(fn => fn()); };
  }, []);

  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    invoke<number>("get_opacity").then(setOpacity).catch(() => {});
  }, []);

  const handleThemeChange = useCallback((t: Theme) => {
    setTheme(t);
  }, []);

  // Search filters note text line-by-line for highlighted display
  const filteredLines = query.trim()
    ? noteText.split("\n").filter(l =>
        l.toLowerCase().includes(query.toLowerCase())
      )
    : null;

  return (
    <div className="root" data-theme={theme} style={{ opacity }}>
      <CustomCursor />

      {/* ── Toolbar ── */}
      <div className="toolbar" data-tauri-drag-region>
        <button
          className="icon-btn drag-handle"
          data-tauri-drag-region
          title="Drag to move"
        >
          <GripVertical size={14} />
        </button>

        <Search className="search-icon" size={13} />

        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") setQuery(""); }}
          spellCheck={false}
          autoComplete="off"
        />

        {query && (
          <button className="icon-btn" onClick={() => setQuery("")} title="Clear (Esc)">
            <X size={12} />
          </button>
        )}

        <button
          className={`icon-btn${silenced ? " mic-on" : ""}`}
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
      </div>

      {/* ── Note area ── */}
      <div className="note-area">
        {filteredLines !== null ? (
          // Search results: read-only list of matching lines
          filteredLines.length === 0 ? (
            <p className="empty-hint">No matches</p>
          ) : (
            <div className="search-results">
              {filteredLines.map((line, i) => (
                <div key={i} className="result-line">{line}</div>
              ))}
            </div>
          )
        ) : (
          <textarea
            ref={textareaRef}
            className="note-textarea"
            placeholder="Start typing your notes…"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        )}
      </div>

      {/* ── Settings overlay ── */}
      {showSettings && (
        <Settings
          onClose={handleSettingsClose}
          opacity={opacity}
          onOpacityChange={setOpacity}
          theme={theme}
          onThemeChange={handleThemeChange}
        />
      )}
    </div>
  );
}
