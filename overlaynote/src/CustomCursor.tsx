import { useEffect, useRef } from "react";
import { MousePointer2 } from "lucide-react";

/** Mirrors Builder's CustomCursor exactly — native cursor hidden via CSS,
 *  this SVG pointer tracks mousemove via rAF so it never disappears. */
export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const visibleRef = useRef(false);

  useEffect(() => {
    let rafId: number;

    const loop = () => {
      if (cursorRef.current && visibleRef.current) {
        cursorRef.current.style.transform =
          `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
      }
      rafId = requestAnimationFrame(loop);
    };

    const onMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      if (!visibleRef.current) {
        visibleRef.current = true;
        if (cursorRef.current) cursorRef.current.style.opacity = "1";
      }
    };

    const onLeave = () => {
      visibleRef.current = false;
      if (cursorRef.current) cursorRef.current.style.opacity = "0";
    };

    const onBlur = () => {
      // keep cursor visible even when window loses focus
      // (mirrors Builder behaviour — cursor stays rendered)
    };

    rafId = requestAnimationFrame(loop);
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onBlur);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

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
        transform: "translate3d(0,0,0)",
        transition: "opacity 0.1s ease-out",
        willChange: "transform",
      }}
    >
      <MousePointer2
        style={{
          width: 20,
          height: 20,
          fill: "#ffffff",
          stroke: "#1a1a2e",
          strokeWidth: 1.5,
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.7))",
        }}
      />
    </div>
  );
}
