import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, Keyboard, Eye, GripVertical, SlidersHorizontal } from "lucide-react";

interface Props {
  onClose: () => void;
  onOpacityChange: (v: number) => void;
  opacity: number;
}

type Action = "toggle" | "expand" | "move";

export function Settings({ onClose, opacity, onOpacityChange }: Props) {
  const [toggleSC, setToggleSC] = useState("Alt+Backslash");
  const [expandSC, setExpandSC] = useState("CommandOrControl+Shift+E");
  const [moveSC]               = useState("Alt+Arrow keys");
  const [recording, setRecording] = useState<Action | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    invoke<string>("get_toggle_shortcut").then(setToggleSC).catch(() => {});
    invoke<string>("get_expand_shortcut").then(setExpandSC).catch(() => {});
  }, []);

  // Listen for shortcut registration errors from Rust
  useEffect(() => {
    const unsub = listen<string>("shortcut-error", (e) => {
      setStatus(`⚠ ${e.payload}`);
    });
    return () => { unsub.then(fn => fn()); };
  }, []);

  const startRecord = (action: Action) => {
    if (action === "move") return; // move is always Alt+Arrows, not rebindable here
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
          if (recording === "toggle") setToggleSC(combo);
          else setExpandSC(combo);
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

  return (
    <div style={overlay}>
      <div style={panel}>
        {/* Header */}
        <div style={headerRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <SlidersHorizontal size={13} style={{ opacity: 0.5 }} />
            <span style={title}>Settings</span>
          </div>
          <button style={iconBtn} onClick={onClose} title="Close">
            <X size={13} />
          </button>
        </div>

        {/* Opacity */}
        <Section icon={<Eye size={12} />} label="Transparency">
          <div style={sliderRow}>
            <input
              type="range" min={0.1} max={1} step={0.01}
              value={opacity}
              onChange={e => handleOpacity(parseFloat(e.target.value))}
              style={sliderStyle}
            />
            <span style={badge}>{Math.round(opacity * 100)}%</span>
          </div>
        </Section>

        {/* Shortcuts */}
        <Section icon={<Keyboard size={12} />} label="Shortcuts">
          <ShortcutRow name="Show / Hide"       value={toggleSC} active={recording === "toggle"} onRecord={() => startRecord("toggle")} />
          <ShortcutRow name="Expand / Collapse" value={expandSC} active={recording === "expand"} onRecord={() => startRecord("expand")} />
          <ShortcutRow name="Move window"       value={moveSC}   active={false}                  onRecord={() => {}} fixed />
        </Section>

        {/* Drag hint */}
        <Section icon={<GripVertical size={12} />} label="Window">
          <p style={hint}>Drag the <GripVertical size={11} style={{ display: "inline", verticalAlign: "middle" }} /> handle in the toolbar to reposition.
          Use <kbd style={kbd}>Alt+↑↓←→</kbd> to move with keyboard.</p>
        </Section>

        {status && <p style={statusText}>{status}</p>}
      </div>
    </div>
  );
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, opacity: 0.5, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function ShortcutRow({ name, value, active, onRecord, fixed }: {
  name: string; value: string; active: boolean; onRecord: () => void; fixed?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{name}</span>
      <button
        style={active ? { ...scBtn, background: "rgba(124,106,247,0.25)", borderColor: "#7c6af7", color: "#c4b8ff" } : scBtn}
        onClick={onRecord}
        title={fixed ? "Fixed shortcut" : "Click to rebind"}
        disabled={fixed}
      >
        {active ? "…recording" : value}
      </button>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0,
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  paddingTop: 64, zIndex: 200,
};

const panel: React.CSSProperties = {
  background: "rgba(14,14,20,0.98)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 14, padding: "14px 16px",
  width: 360, display: "flex", flexDirection: "column", gap: 16,
  backdropFilter: "blur(24px)",
  boxShadow: "0 12px 48px rgba(0,0,0,0.65)",
  color: "#e8e8ec",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontSize: 13,
};

const headerRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  paddingBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const title: React.CSSProperties = { fontSize: 13, fontWeight: 600 };

const iconBtn: React.CSSProperties = {
  background: "none", border: "none",
  color: "rgba(232,232,236,0.4)", padding: 4, borderRadius: 6,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const sliderRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
};

const sliderStyle: React.CSSProperties = {
  flex: 1, accentColor: "#7c6af7",
};

const badge: React.CSSProperties = {
  fontSize: 11, color: "rgba(232,232,236,0.4)",
  minWidth: 32, textAlign: "right",
};

const scBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 6, color: "#e8e8ec",
  fontSize: 11, padding: "3px 8px",
  fontFamily: "monospace",
};

const statusText: React.CSSProperties = {
  fontSize: 11, color: "rgba(232,232,236,0.45)", textAlign: "center",
};

const hint: React.CSSProperties = {
  fontSize: 11, color: "rgba(232,232,236,0.45)", lineHeight: 1.6,
};

const kbd: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 4, padding: "1px 5px", fontSize: 10,
  fontFamily: "monospace",
};
