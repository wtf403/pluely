import { useEffect, useRef } from "react";
import { MousePointer2 } from "lucide-react";

/**
 * Virtual cursor overlay.
 *
 * Key behaviour:
 * - The OS native cursor is hidden via CSS `cursor: none` on everything.
 * - This component draws a virtual cursor that follows mousemove inside the window.
 * - When the mouse leaves the window (mouseleave) the virtual cursor stays rendered
 *   at the last known position so the user sees "where the cursor was" — matching
 *   how the app appears to outside observers (e.g. proctoring software).
 * - Only hides on window blur (app loses focus entirely).
 */
export function CustomCursor({ theme }: { theme: "light" | "dark" }) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const posRef    = useRef({ x: -40, y: -40 });
  const insideRef = useRef(false);

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
      if (!insideRef.current) {
        insideRef.current = true;
        if (cursorRef.current) cursorRef.current.style.opacity = "1";
      }
    };

    // Mouse left the window — keep cursor visible at last position
    // so it looks natural from the outside. Don't hide.
    const onLeave = () => {
      insideRef.current = false;
      // intentionally do NOT hide — leave cursor where it was
    };

    // App lost focus — hide the virtual cursor entirely
    const onBlur = () => {
      if (cursorRef.current) cursorRef.current.style.opacity = "0";
    };

    const onFocus = () => {
      if (cursorRef.current) cursorRef.current.style.opacity = "1";
    };

    rafId = requestAnimationFrame(loop);
    document.addEventListener("mousemove", onMove,  { passive: true });
    document.addEventListener("mouseleave", onLeave, { passive: true });
    window.addEventListener("blur",  onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur",  onBlur);
      window.removeEventListener("focus", onFocus);
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
        transition: "opacity 0.1s ease-out",
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
