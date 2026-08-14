import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";
import { X, Keyboard, Eye, GripVertical, SlidersHorizontal, Sun, Moon, Power } from "lucide-react";
import type { Theme } from "./App";

interface Props {
  onClose: () => void;
  onOpacityChange: (v: number) => void;
  opacity: number;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}

type Action = "toggle";

const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift",
  "ControlLeft", "ControlRight", "MetaLeft", "MetaRight",
  "AltLeft", "AltRight", "ShiftLeft", "ShiftRight"]);

/** Build a Tauri shortcut string from a KeyboardEvent.
 *  Modifier is optional — single key like "F9" is valid. */
function buildShortcut(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null; // modifier-only press, keep waiting
  const mods: string[] = [];
  if (e.metaKey || e.ctrlKey) mods.push("CommandOrControl");
  if (e.altKey)   mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [...mods, key].join("+");
}

export function Settings({ onClose, opacity, onOpacityChange, theme, onThemeChange }: Props) {
  const [toggleSC, setToggleSC]     = useState("Alt+Backslash");
  const [recording, setRecording]   = useState<Action | null>(null);
  const [status, setStatus]         = useState("");

  useEffect(() => {
    invoke<string>("get_toggle_shortcut").then(setToggleSC).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = listen<string>("shortcut-error", (e) => {
      setStatus(`⚠ ${e.payload}`);
    });
    return () => { unsub.then(fn => fn()); };
  }, []);

  const startRecord = (action: Action) => {
    setRecording(action);
    setStatus("Press any key or combo — modifier is optional…");
  };

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const combo = buildShortcut(e);
      if (!combo) return; // modifier-only, wait for real key
      invoke("update_shortcut", { action: recording, shortcut: combo })
        .then(() => {
          setToggleSC(combo);
          setStatus(`✓ Saved: ${combo}`);
        })
        .catch((err: string) => setStatus(`⚠ ${err}`));
      setRecording(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording]);

  const cancelRecord = useCallback(() => {
    setRecording(null);
    setStatus("");
  }, []);

  const handleOpacity = useCallback((v: number) => {
    onOpacityChange(v);
    invoke("set_opacity", { value: v }).catch(() => {});
  }, [onOpacityChange]);

  const isDark = theme === "dark";

  return (
    <div style={overlayStyle}>
      <div style={panelStyle(isDark)}>

        {/* Header */}
        <div style={row}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <SlidersHorizontal size={13} style={{ opacity: 0.45 }} />
            <span style={titleStyle(isDark)}>Settings</span>
          </div>
          <button style={iconBtnStyle(isDark)} onClick={onClose} title="Close">
            <X size={13} />
          </button>
        </div>

        {/* Theme */}
        <Section icon={isDark ? <Moon size={12} /> : <Sun size={12} />} label="Theme" isDark={isDark}>
          <div style={{ display: "flex", gap: 6 }}>
            <ThemeBtn label="Light" icon={<Sun size={12} />}  active={!isDark} onClick={() => onThemeChange("light")} isDark={isDark} />
            <ThemeBtn label="Dark"  icon={<Moon size={12} />} active={isDark}  onClick={() => onThemeChange("dark")}  isDark={isDark} />
          </div>
        </Section>

        {/* Opacity */}
        <Section icon={<Eye size={12} />} label="Transparency" isDark={isDark}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="range" min={0.1} max={1} step={0.01}
              value={opacity}
              onChange={e => handleOpacity(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: "#7c6af7" }}
            />
            <span style={badgeStyle(isDark)}>{Math.round(opacity * 100)}%</span>
          </div>
        </Section>

        {/* Shortcuts */}
        <Section icon={<Keyboard size={12} />} label="Shortcuts" isDark={isDark}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <ShortcutRow
              name="Show / Hide"
              value={toggleSC}
              recording={recording === "toggle"}
              onRecord={() => startRecord("toggle")}
              onCancel={cancelRecord}
              isDark={isDark}
            />
            <ShortcutRow
              name="Move window"
              value="Alt + ↑↓←→"
              recording={false}
              onRecord={() => {}}
              onCancel={() => {}}
              fixed
              isDark={isDark}
            />
          </div>
        </Section>

        {/* Window hints */}
        <Section icon={<GripVertical size={12} />} label="Window" isDark={isDark}>
          <p style={hintStyle(isDark)}>
            Drag the grip to reposition.
            Resize from edges. <kbd style={kbdStyle(isDark)}>Alt+↑↓←→</kbd> to nudge.
          </p>
        </Section>

        {/* Quit */}
        <button
          onClick={() => exit(0)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "8px 12px", borderRadius: 8, fontSize: 12,
            background: isDark ? "rgba(248,113,113,0.12)" : "rgba(239,68,68,0.1)",
            border: `1px solid ${isDark ? "rgba(248,113,113,0.25)" : "rgba(239,68,68,0.2)"}`,
            color: isDark ? "#fca5a5" : "#dc2626",
            fontWeight: 500,
            transition: "all 0.15s",
          }}
          title="Quit OverlayNote"
        >
          <Power size={13} />
          Quit OverlayNote
        </button>

        {status && (
          <p style={{
            fontSize: 11, textAlign: "center",
            color: status.startsWith("✓") ? "#22c55e" : status.startsWith("⚠") ? "#f87171" : (isDark ? "rgba(232,232,236,0.45)" : "rgba(26,26,31,0.45)"),
          }}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ icon, label, children, isDark }: {
  icon: React.ReactNode; label: string; children: React.ReactNode; isDark: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        opacity: 0.42, fontSize: 10.5, textTransform: "uppercase",
        letterSpacing: "0.07em", color: isDark ? "#e8e8ec" : "#1a1a1f",
      }}>
        {icon}<span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function ThemeBtn({ label, icon, active, onClick, isDark }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void; isDark: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
      padding: "6px 10px", borderRadius: 8, fontSize: 12,
      background: active ? "rgba(124,106,247,0.15)" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"),
      border: `1px solid ${active ? "rgba(124,106,247,0.4)" : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)")}`,
      color: active ? "#7c6af7" : (isDark ? "rgba(232,232,236,0.7)" : "rgba(26,26,31,0.7)"),
      fontWeight: active ? 600 : 400,
      transition: "all 0.15s",
    }}>
      {icon}{label}
    </button>
  );
}

function ShortcutRow({ name, value, recording, onRecord, onCancel, fixed, isDark }: {
  name: string; value: string; recording: boolean;
  onRecord: () => void; onCancel: () => void;
  fixed?: boolean; isDark: boolean;
}) {
  const textColor = isDark ? "rgba(232,232,236,0.65)" : "rgba(26,26,31,0.65)";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 12, color: textColor, flexShrink: 0 }}>{name}</span>
      {recording ? (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{
            fontSize: 11, padding: "3px 8px", borderRadius: 6,
            background: "rgba(124,106,247,0.18)", border: "1px solid rgba(124,106,247,0.45)",
            color: "#c4b8ff", fontFamily: "monospace",
          }}>
            Press a key…
          </span>
          <button onClick={onCancel} style={{
            background: "none", border: "none",
            color: isDark ? "rgba(232,232,236,0.4)" : "rgba(26,26,31,0.4)",
            fontSize: 11, padding: "2px 4px", borderRadius: 5,
          }}>
            ✕
          </button>
        </div>
      ) : (
        <button
          style={scBtnStyle(isDark)}
          onClick={onRecord}
          disabled={fixed}
          title={fixed ? "Fixed shortcut" : "Click to rebind — modifier optional"}
        >
          {value}
        </button>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0,
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  paddingTop: 50, zIndex: 200,
};

const panelStyle = (isDark: boolean): React.CSSProperties => ({
  background: isDark ? "rgba(14,14,20,0.99)" : "rgba(255,255,255,0.99)",
  border: `1px solid ${isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)"}`,
  borderRadius: 14, padding: "14px 16px",
  width: 320, display: "flex", flexDirection: "column", gap: 16,
  backdropFilter: "blur(24px)",
  boxShadow: isDark ? "0 12px 48px rgba(0,0,0,0.65)" : "0 8px 32px rgba(0,0,0,0.14)",
  color: isDark ? "#e8e8ec" : "#1a1a1f",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontSize: 13,
});

const row: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 2,
};

const titleStyle = (isDark: boolean): React.CSSProperties => ({
  fontSize: 13, fontWeight: 600, color: isDark ? "#e8e8ec" : "#1a1a1f",
});

const iconBtnStyle = (isDark: boolean): React.CSSProperties => ({
  background: "none", border: "none",
  color: isDark ? "rgba(232,232,236,0.35)" : "rgba(26,26,31,0.35)",
  padding: 4, borderRadius: 6, display: "flex", alignItems: "center",
});

const badgeStyle = (isDark: boolean): React.CSSProperties => ({
  fontSize: 11, color: isDark ? "rgba(232,232,236,0.4)" : "rgba(26,26,31,0.4)",
  minWidth: 32, textAlign: "right",
});

const scBtnStyle = (isDark: boolean): React.CSSProperties => ({
  background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
  border: `1px solid ${isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)"}`,
  borderRadius: 6, color: isDark ? "#e8e8ec" : "#1a1a1f",
  fontSize: 11, padding: "3px 8px", fontFamily: "monospace", maxWidth: 160,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
});

const hintStyle = (isDark: boolean): React.CSSProperties => ({
  fontSize: 11, color: isDark ? "rgba(232,232,236,0.42)" : "rgba(26,26,31,0.42)", lineHeight: 1.6,
});

const kbdStyle = (isDark: boolean): React.CSSProperties => ({
  background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
  borderRadius: 4, padding: "1px 5px", fontSize: 10, fontFamily: "monospace",
});
