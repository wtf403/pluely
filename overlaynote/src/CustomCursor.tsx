import { useEffect, useRef } from "react";
import { MousePointer2 } from "lucide-react";

/**
 * Virtual cursor overlay — always visible while mouse is over the window.
 * Non-activating panel means window blur/focus don't apply.
 */
export function CustomCursor({ theme }: { theme: "light" | "dark" }) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const posRef    = useRef({ x: -40, y: -40 });

  useEffect(() => {
    let rafId: number;

    const loop = () => {
      if (cursorRef.current) {
        cursorRef.current.style.transform =
          `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
      }
      rafId = requestAnimationFrame(loop);
    };

    const onMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      if (cursorRef.current && cursorRef.current.style.opacity !== "1") {
        cursorRef.current.style.opacity = "1";
      }
    };

    const onLeave = () => {
      // Keep cursor visible at last position — natural from outside perspective
    };

    rafId = requestAnimationFrame(loop);
    document.addEventListener("mousemove", onMove,  { passive: true });
    document.addEventListener("mouseleave", onLeave, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const isDark = theme === "dark";

  return (
    <div
      ref={cursorRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 99999,
        opacity: 0,
        transform: "translate3d(-40px,-40px,0)",
        transition: "opacity 0.15s ease-out",
        willChange: "transform",
      }}
    >
      <MousePointer2
        style={{
          width: 20,
          height: 20,
          fill: isDark ? "#ffffff" : "#1a1a2e",
          stroke: isDark ? "#1a1a2e" : "#ffffff",
          strokeWidth: 1.5,
          filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.55))",
        }}
      />
    </div>
  );
}
