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
import { matchesQuery } from "./transliterate";
import "./App.css";

export type Theme = "light" | "dark";

export default function App() {
  const [query, setQuery]               = useState("");
  const [noteText, setNoteText]         = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [opacity, setOpacity]           = useState(1.0);
  const [theme, setTheme]               = useState<Theme>("light");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRef   = useRef<HTMLInputElement>(null);
  const { silenced, toggle: toggleMic } = useMicSilence();

  // Load settings on mount
  useEffect(() => {
    invoke<number>("get_opacity").then(setOpacity).catch(() => {});
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  // Apply theme attribute so CSS variables switch
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Focus search on mount and window focus/show
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const onFocus = () => searchRef.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const unsub = listen("focus-input", () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });
    return () => { unsub.then(fn => fn()); };
  }, []);

  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    invoke<number>("get_opacity").then(setOpacity).catch(() => {});
  }, []);

  /**
   * Split note into paragraphs (groups of non-blank lines separated by
   * one or more blank lines). Filter paragraphs that contain the query
   * using transliteration-aware matching.
   */
  const searchResults: string[] | null = (() => {
    if (!query.trim()) return null;
    const paragraphs = noteText
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);
    return paragraphs.filter(p => matchesQuery(p, query.trim()));
  })();

  return (
    <div className="root" data-theme={theme} style={{ opacity }}>
      <CustomCursor theme={theme} />

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
          ref={searchRef}
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

      {/* ── Note / search area ── */}
      <div className="note-area">
        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <p className="empty-hint">No matches</p>
          ) : (
            <div className="search-results">
              {searchResults.map((para, i) => (
                <div key={i} className="result-para">{para}</div>
              ))}
            </div>
          )
        ) : (
          <textarea
            ref={textareaRef}
            className="note-textarea"
            placeholder="Start typing… (blank line separates paragraphs for search)"
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
          onThemeChange={setTheme}
        />
      )}
    </div>
  );
}
