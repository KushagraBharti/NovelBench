"use client";

import { ReactNode, useCallback } from "react";
import { useKonamiCode } from "@/hooks/useKonamiCode";
import MatrixRain from "./MatrixRain";
import { useParticleBurst } from "./ParticleBurst";

export function EasterEggProvider({ children }: { children: ReactNode }) {
  const konamiActive = useKonamiCode();
  const burst = useParticleBurst();

  const handleShiftClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey) {
        burst(e.clientX, e.clientY, 16);
      }
    },
    [burst]
  );

  return (
    <div onClick={handleShiftClick}>
      {children}
      <MatrixRain active={konamiActive} />
    </div>
  );
}
