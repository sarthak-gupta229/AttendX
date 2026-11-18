"use client";

import React, { useState, useEffect } from "react";
import styles from "@/styles/startup.module.css";

interface StartupScreenProps {
  onComplete: () => void;
}

export function StartupScreen({ onComplete }: StartupScreenProps) {
  const [stage, setStage] = useState<"drop" | "shine" | "fade">("drop");

  useEffect(() => {
    // Stage 1: Drop down (0ms - 800ms)
    // Stage 2: Glow shine (800ms - 1700ms)
    const shineTimer = setTimeout(() => {
      setStage("shine");
    }, 800);

    // Stage 3: Fade out to UI (1700ms - 2200ms)
    const fadeTimer = setTimeout(() => {
      setStage("fade");
    }, 1800);

    const finishTimer = setTimeout(() => {
      onComplete();
    }, 2200);

    return () => {
      clearTimeout(shineTimer);
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`${styles.startupOverlay} ${stage === "fade" ? styles.fadeOut : ""}`}
      onClick={onComplete}
      role="dialog"
      aria-label="AttendX Startup Screen"
    >
      <div className={styles.bootWindow}>
        {/* Retro Game Boy Boot Text Animation */}
        <div className={styles.logoContainer}>
          <div
            className={`${styles.brandName} ${
              stage === "drop" ? styles.dropIn : styles.shining
            }`}
          >
            AttendX
          </div>
          <div className={styles.registeredSign}>®</div>
        </div>

        <div className={styles.bootSub}>
          <span className={styles.dot} />
          LIVE HEADCOUNT SYSTEM
          <span className={styles.dot} />
        </div>

        <div className={styles.skipHint}>[ Click or press any key to enter ]</div>
      </div>
    </div>
  );
}
