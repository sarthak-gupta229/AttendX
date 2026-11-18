"use client";

import React, { useState, forwardRef, useImperativeHandle, useCallback } from "react";
import styles from "@/styles/reactionLayer.module.css";

export interface ReactionLayerHandle {
  spawn: (sessionId: string, emoji: "😂" | "😢") => void;
}

interface FloatingEmojiItem {
  key: string;
  emoji: "😂" | "😢";
  left: number;
  top: number;
  tx: string;
}

export const ReactionLayer = forwardRef<ReactionLayerHandle>((_, ref) => {
  const [items, setItems] = useState<FloatingEmojiItem[]>([]);

  const spawn = useCallback((sessionId: string, emoji: "😂" | "😢") => {
    const cardEl = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (!cardEl) return;

    const rect = cardEl.getBoundingClientRect();
    const left = rect.left + rect.width / 2 - 14; // center 28px emoji
    const top = rect.top + rect.height / 2 - 14;

    const tx = `${Math.floor(Math.random() * 40) - 20}px`;
    const key = `${sessionId}-${Date.now()}-${Math.random()}`;

    setItems((prev) => {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
      const maxCap = isMobile ? 20 : 40;
      const updated = [...prev, { key, emoji, left, top, tx }];
      if (updated.length > maxCap) {
        return updated.slice(updated.length - maxCap);
      }
      return updated;
    });
  }, []);

  useImperativeHandle(ref, () => ({ spawn }), [spawn]);

  const handleAnimationEnd = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  return (
    <div className={styles.layer} aria-hidden="true">
      {items.map((item) => (
        <span
          key={item.key}
          className={styles.floatEmoji}
          style={
            {
              left: `${item.left}px`,
              top: `${item.top}px`,
              "--tx": item.tx,
            } as React.CSSProperties
          }
          onAnimationEnd={() => handleAnimationEnd(item.key)}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
});

ReactionLayer.displayName = "ReactionLayer";
