"use client";

import React, { useState, useEffect } from "react";
import { Button } from "./ui/Button";
import styles from "@/styles/addSessionForm.module.css";

interface AddSessionFormProps {
  currentCount: number;
  maxSessions: number;
  isConnected: boolean;
  onAdd: (name: string) => void;
  lastAddedName?: string | null;
}

export const AddSessionForm: React.FC<AddSessionFormProps> = ({
  currentCount,
  maxSessions,
  isConnected,
  onAdd,
  lastAddedName,
}) => {
  const [name, setName] = useState("");
  const isLimitReached = currentCount >= maxSessions;

  useEffect(() => {
    // Clear input after broadcast confirms new session
    if (lastAddedName && name.trim() === lastAddedName.trim()) {
      setName("");
    }
  }, [lastAddedName, name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isLimitReached || !isConnected) return;
    onAdd(trimmed);
  };

  return (
    <form className={styles.formContainer} onSubmit={handleSubmit}>
      <div className={styles.inputRow}>
        <input
          type="text"
          className={styles.input}
          placeholder="New session name (e.g. Room 101, Math 1)"
          value={name}
          maxLength={40}
          autoComplete="off"
          enterKeyHint="done"
          disabled={!isConnected || isLimitReached}
          onChange={(e) => setName(e.target.value)}
          aria-label="New session name"
        />
        <Button
          type="submit"
          disabled={!isConnected || !name.trim() || isLimitReached}
          style={{ minHeight: "48px" }}
        >
          + Add Session
        </Button>
      </div>

      {isLimitReached && (
        <div className={styles.limitMessage} role="alert">
          Limit of {maxSessions} sessions reached.
        </div>
      )}
    </form>
  );
};
