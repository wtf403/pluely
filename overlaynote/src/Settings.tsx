import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Keyboard, Eye } from "lucide-react";

interface Props {
  onClose: () => void;
}

export function Settings({ onClose }: Props) {
  const [opacity, setOpacity] = useState(0.92);
  const [toggleSC, setToggleSC] = useState("CommandOrControl+Shift+Space");
  const [expandSC, setExpandSC] = useState("CommandOrControl+Shift+E");
  const [recording, setRecording] = useState<"toggle" | "expand" | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    invoke<number>("get_opacity").then(setOpacity).catch(() => {});
    invoke<string>("get_toggle_shortcut").then(setToggleSC).catch(() => {});
    invoke<string>("get_expand_shortcut").then(setExpandSC).catch(() => {});
  }, []);

  const handleOpacity = (v: number) => {
    setOpacity(v);
    invoke("set_opacity", { value: v }).catch(() => {});
  };

  const startRecord = (action: "toggle" | "expand") => {
    setRecording(action);
    setStatus("Press your shortcut combination…");
  };

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const mods: string[] = [];
      if (e.metaKey || e.ctrlKey) mods.push("CommandOrControl");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");

      const key = e.key;
      const ignore = ["Control", "Meta", "Alt", "Shift"];
      if (ignore.includes(key)) return;

      const combo = [...mods, key.toUpperCase()].join("+");

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

  return (
    <div style={overlay}>
      <div style={panel}>
        {/* Header */}
        <div style={row}>
          <span style={title}>Settings</span>
          <button style={iconBtn} onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Opacity */}
        <section style={section}>
          <div style={labelRow}>
            <Eye size={13} style={{ opacity: 0.6 }} />
            <span style={label}>Transparency</span>
            <span style={value}>{Math.round(opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(e) => handleOpacity(parseFloat(e.target.value))}
            style={slider}
          />
        </section>

        {/* Shortcuts */}
        <section style={section}>
          <div style={labelRow}>
            <Keyboard size={13} style={{ opacity: 0.6 }} />
            <span style={label}>Shortcuts</span>
          </div>

          <ShortcutRow
            name="Show / Hide"
            value={toggleSC}
            active={recording === "toggle"}
            onRecord={() => startRecord("toggle")}
          />
          <ShortcutRow
            name="Expand / Collapse"
            value={expandSC}
            active={recording === "expand"}
            onRecord={() => startRecord("expand")}
          />
        </section>

        {status && <p style={statusText}>{status}</p>}
      </div>
    </div>
  );
}

function ShortcutRow({
  name,
  value,
  active,
  onRecord,
}: {
  name: string;
  value: string;
  active: boolean;
  onRecord: () => void;
}) {
  return (
    <div style={scRow}>
      <span style={scName}>{name}</span>
      <button style={active ? scBtnActive : scBtn} onClick={onRecord}>
        {active ? "…" : value}
      </button>
    </div>
  );
}

// ----- styles -----
const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: 60,
  zIndex: 100,
};

const panel: React.CSSProperties = {
  background: "rgba(15,15,20,0.97)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 14,
  padding: "16px 18px",
  width: 360,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  backdropFilter: "blur(20px)",
  boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
  color: "#e8e8ec",
  fontFamily: "var(--font, system-ui)",
  fontSize: 13,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const title: React.CSSProperties = { fontSize: 14, fontWeight: 600 };

const section: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const labelRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  opacity: 0.75,
};

const label: React.CSSProperties = { fontSize: 12, flex: 1 };

const value: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(232,232,236,0.5)",
};

const slider: React.CSSProperties = {
  width: "100%",
  accentColor: "#7c6af7",
};

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(232,232,236,0.5)",
  padding: 4,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const scRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const scName: React.CSSProperties = {
  opacity: 0.65,
  fontSize: 12,
};

const scBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  color: "#e8e8ec",
  fontSize: 11,
  padding: "3px 8px",
  fontFamily: "monospace",
};

const scBtnActive: React.CSSProperties = {
  ...scBtn,
  background: "rgba(124,106,247,0.2)",
  borderColor: "#7c6af7",
  color: "#c4b8ff",
};

const statusText: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(232,232,236,0.5)",
  textAlign: "center",
};
