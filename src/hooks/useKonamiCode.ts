"use client";

import { useEffect, useState, useRef } from "react";

const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

export function useKonamiCode() {
  const [activated, setActivated] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase() === KONAMI_SEQUENCE[indexRef.current]?.toLowerCase()
        ? e.key
        : e.key;

      if (key.toLowerCase() === KONAMI_SEQUENCE[indexRef.current]?.toLowerCase()) {
        indexRef.current++;
        if (indexRef.current === KONAMI_SEQUENCE.length) {
          setActivated(true);
          indexRef.current = 0;
          // Auto-deactivate after animation
          setTimeout(() => setActivated(false), 6000);
        }
      } else {
        indexRef.current = 0;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return activated;
}
