import { useRef, useCallback, useState } from "react";

/**
 * Silences the microphone without OS-level muting.
 * Creates a Web Audio gain node at ~0.02 — apps see an active stream,
 * OS mic indicator stays lit, but the actual audio is near-silent.
 *
 * Returns { silenced, toggle }
 */
export function useMicSilence() {
  const [silenced, setSilenced] = useState(false);

  // We keep the AudioContext + GainNode alive across toggles so there's
  // no click/gap artefact when re-enabling.
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const toggle = useCallback(async () => {
    if (!silenced) {
      // --- Silence ---
      try {
        // Get (or reuse) the mic stream
        if (!streamRef.current) {
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        }

        if (!ctxRef.current) {
          ctxRef.current = new AudioContext();
        }
        const ctx = ctxRef.current;

        if (!gainRef.current) {
          const src = ctx.createMediaStreamSource(streamRef.current);
          const gain = ctx.createGain();
          // ~0.02 = nearly silent but not 0 (0 might get optimised away by some drivers)
          gain.gain.value = 0.02;
          src.connect(gain);
          // Connect to destination so the pipeline stays alive
          gain.connect(ctx.destination);
          gainRef.current = gain;
        } else {
          gainRef.current.gain.value = 0.02;
        }

        setSilenced(true);
      } catch (err) {
        console.error("mic silence: could not access microphone", err);
      }
    } else {
      // --- Restore ---
      if (gainRef.current) {
        gainRef.current.gain.value = 1.0;
      }
      setSilenced(false);
    }
  }, [silenced]);

  return { silenced, toggle };
}
