import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, Keyboard, Eye, GripVertical, SlidersHorizontal, Sun, Moon } from "lucide-react";
import type { Theme } from "./App";

interface Props {
  onClose: () => void;
  onOpacityChange: (v: number) => void;
  opacity: number;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}

type Action = "toggle";

export function Settings({ onClose, opacity, onOpacityChange, theme, onThemeChange }: Props) {
  const [toggleSC, setToggleSC] = useState("Alt+Backslash");
  const [recording, setRecording] = useState<Action | null>(null);
  const [status, setStatus] = useState("");

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
    setStatus("Press your shortcut combination…");
  };

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const mods: string[] = [];
      if (e.metaKey || e.ctrlKey) mods.push("CommandOrControl");
      if (e.altKey)   mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      const key = e.key;
      if (["Control", "Meta", "Alt", "Shift"].includes(key)) return;
      const combo = [...mods, key.length === 1 ? key.toUpperCase() : key].join("+");
      invoke("update_shortcut", { action: recording, shortcut: combo })
        .then(() => {
          setToggleSC(combo);
          setStatus(`✓ Saved: ${combo}`);
        })
        .catch((err) => setStatus(`Error: ${err}`));
      setRecording(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording]);

  const handleOpacity = useCallback((v: number) => {
    onOpacityChange(v);
    invoke("set_opacity", { value: v }).catch(() => {});
  }, [onOpacityChange]);

  const isDark = theme === "dark";

  return (
    <div style={overlay}>
      <div style={panel(isDark)}>
        {/* Header */}
        <div style={headerRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <SlidersHorizontal size={13} style={{ opacity: 0.45 }} />
            <span style={titleStyle(isDark)}>Settings</span>
          </div>
          <button style={iconBtn(isDark)} onClick={onClose} title="Close">
            <X size={13} />
          </button>
        </div>

        {/* Theme */}
        <Section icon={isDark ? <Moon size={12} /> : <Sun size={12} />} label="Theme" isDark={isDark}>
          <div style={{ display: "flex", gap: 6 }}>
            <ThemeBtn label="Light" icon={<Sun size={12} />} active={!isDark} onClick={() => onThemeChange("light")} isDark={isDark} />
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
            <span style={badge(isDark)}>{Math.round(opacity * 100)}%</span>
          </div>
        </Section>

        {/* Shortcuts */}
        <Section icon={<Keyboard size={12} />} label="Shortcuts" isDark={isDark}>
          <ShortcutRow name="Show / Hide"       value={toggleSC} active={recording === "toggle"} onRecord={() => startRecord("toggle")} isDark={isDark} />
          <ShortcutRow name="Move window"       value="Alt + ↑↓←→" active={false} onRecord={() => {}} fixed isDark={isDark} />
        </Section>

        {/* Drag hint */}
        <Section icon={<GripVertical size={12} />} label="Window" isDark={isDark}>
          <p style={hint(isDark)}>Drag the <GripVertical size={11} style={{ display: "inline", verticalAlign: "middle" }} /> handle to reposition.
          Use <kbd style={kbd(isDark)}>Alt+↑↓←→</kbd> to move with keyboard.</p>
        </Section>

        {status && <p style={statusText(isDark)}>{status}</p>}
      </div>
    </div>
  );
}

function Section({ icon, label, children, isDark }: {
  icon: React.ReactNode; label: string; children: React.ReactNode; isDark: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, opacity: 0.45, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: isDark ? "#e8e8ec" : "#1a1a1f" }}>
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function ThemeBtn({ label, icon, active, onClick, isDark }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void; isDark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        padding: "6px 10px", borderRadius: 8, fontSize: 12,
        background: active ? "rgba(124,106,247,0.15)" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"),
        border: active ? "1px solid rgba(124,106,247,0.4)" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        color: active ? "#7c6af7" : (isDark ? "rgba(232,232,236,0.7)" : "rgba(26,26,31,0.7)"),
        fontWeight: active ? 600 : 400,
        transition: "all 0.15s",
      }}
    >
      {icon}{label}
    </button>
  );
}

function ShortcutRow({ name, value, active, onRecord, fixed, isDark }: {
  name: string; value: string; active: boolean; onRecord: () => void; fixed?: boolean; isDark: boolean;
}) {
  const textColor = isDark ? "#e8e8ec" : "#1a1a1f";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12, opacity: 0.65, color: textColor }}>{name}</span>
      <button
        style={active
          ? { ...scBtn(isDark), background: "rgba(124,106,247,0.2)", borderColor: "#7c6af7", color: "#c4b8ff" }
          : scBtn(isDark)
        }
        onClick={onRecord}
        title={fixed ? "Fixed shortcut" : "Click to rebind"}
        disabled={fixed}
      >
        {active ? "…recording" : value}
      </button>
    </div>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0,
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  paddingTop: 52, zIndex: 200,
  background: "transparent",
};

const panel = (isDark: boolean): React.CSSProperties => ({
  background: isDark ? "rgba(14,14,20,0.98)" : "rgba(255,255,255,0.98)",
  border: `1px solid ${isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)"}`,
  borderRadius: 14, padding: "14px 16px",
  width: 340, display: "flex", flexDirection: "column", gap: 16,
  backdropFilter: "blur(24px)",
  boxShadow: isDark ? "0 12px 48px rgba(0,0,0,0.65)" : "0 8px 32px rgba(0,0,0,0.14)",
  color: isDark ? "#e8e8ec" : "#1a1a1f",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontSize: 13,
});

const headerRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  paddingBottom: 4,
};

const titleStyle = (isDark: boolean): React.CSSProperties => ({
  fontSize: 13, fontWeight: 600,
  color: isDark ? "#e8e8ec" : "#1a1a1f",
});

const iconBtn = (isDark: boolean): React.CSSProperties => ({
  background: "none", border: "none",
  color: isDark ? "rgba(232,232,236,0.35)" : "rgba(26,26,31,0.35)",
  padding: 4, borderRadius: 6,
  display: "flex", alignItems: "center", justifyContent: "center",
});

const badge = (isDark: boolean): React.CSSProperties => ({
  fontSize: 11, color: isDark ? "rgba(232,232,236,0.4)" : "rgba(26,26,31,0.4)",
  minWidth: 32, textAlign: "right",
});

const scBtn = (isDark: boolean): React.CSSProperties => ({
  background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
  border: `1px solid ${isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)"}`,
  borderRadius: 6,
  color: isDark ? "#e8e8ec" : "#1a1a1f",
  fontSize: 11, padding: "3px 8px",
  fontFamily: "monospace",
});

const statusText = (isDark: boolean): React.CSSProperties => ({
  fontSize: 11, color: isDark ? "rgba(232,232,236,0.45)" : "rgba(26,26,31,0.45)",
  textAlign: "center",
});

const hint = (isDark: boolean): React.CSSProperties => ({
  fontSize: 11, color: isDark ? "rgba(232,232,236,0.45)" : "rgba(26,26,31,0.45)",
  lineHeight: 1.6,
});

const kbd = (isDark: boolean): React.CSSProperties => ({
  background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
  borderRadius: 4, padding: "1px 5px", fontSize: 10,
  fontFamily: "monospace",
});
