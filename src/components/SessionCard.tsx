"use client";

import React, { useState, useEffect, useRef, memo } from "react";
import { SessionDTO } from "@/lib/sessions/snapshot";
import { Button } from "./ui/Button";
import styles from "@/styles/sessionCard.module.css";

interface SessionCardProps {
  session: SessionDTO;
  canEdit: boolean;
  isConnected: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onIn: (id: string) => void;
  onOut: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onRemove: (id: string) => void;
  onReact: (id: string, emoji: "😂" | "😢") => void;
}

const numberFormatter = new Intl.NumberFormat("en-US");

export const SessionCard = memo(function SessionCard({
  session,
  canEdit,
  isConnected,
  isSelected,
  onSelect,
  onIn,
  onOut,
  onRename,
  onRemove,
  onReact,
}: SessionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(session.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditName(session.name);
  }, [session.name]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("[DEBUG SessionCard] handleIn clicked!", { isConnected, canEdit, id: session.id });
    if (!isConnected || !canEdit) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onIn(session.id);
  };

  const handleOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isConnected || !canEdit || session.count <= 0) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onOut(session.id);
  };

  const handleRenameSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== session.name && trimmed.length <= 40) {
      onRename(session.id, trimmed);
    } else {
      setEditName(session.name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setEditName(session.name);
      setIsEditing(false);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onRemove(session.id);
  };

  return (
    <div
      className={`${styles.card} ${isSelected ? styles.cardActive : ""}`}
      data-session-id={session.id}
      onClick={() => onSelect(session.id)}
      tabIndex={0}
      onFocus={() => onSelect(session.id)}
      role="region"
      aria-label={`Session ${session.name}`}
    >
      {isSelected && <span className={styles.cursor} aria-hidden="true">▶</span>}

      <div className={styles.cardInner}>
        {/* Line 1: Session name or rename input */}
        <div className={styles.headerLine}>
          {isEditing && canEdit ? (
            <input
              ref={inputRef}
              type="text"
              className={styles.nameInput}
              value={editName}
              maxLength={40}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              aria-label="Edit session name"
            />
          ) : (
            <span
              className={`${styles.sessionName} ${canEdit ? styles.sessionNameEditable : ""}`}
              title={session.name}
              aria-label={session.name}
              onClick={(e) => {
                if (canEdit) {
                  e.stopPropagation();
                  setIsEditing(true);
                }
              }}
            >
              {session.name}
            </span>
          )}
        </div>

        {/* Line 2: Count and In/Out (or count only for visitors) */}
        <div className={styles.counterLine}>
          {canEdit && (
            <Button
              variant="out"
              disabled={!isConnected || session.count <= 0}
              onClick={handleOut}
              aria-label={`Student out for ${session.name}`}
            >
              − Out
            </Button>
          )}

          <div className={styles.countWrapper}>
            <div
              className={styles.countNumber}
              aria-live="polite"
              aria-atomic="true"
              aria-label={`${session.count} present`}
            >
              {numberFormatter.format(session.count)}
            </div>
            <div className={styles.countLabel}>Present</div>
          </div>

          {canEdit && (
            <Button
              variant="in"
              disabled={!isConnected}
              onClick={handleIn}
              aria-label={`Student in for ${session.name}`}
            >
              + In
            </Button>
          )}
        </div>

        {/* Line 3: Reactions & Remove (operators only) */}
        {canEdit && (
          <div className={styles.footerLine}>
            <div className={styles.reactionGroup}>
              <Button
                variant="emoji"
                disabled={!isConnected}
                onClick={(e) => {
                  e.stopPropagation();
                  onReact(session.id, "😂");
                }}
                aria-label="React with laugh"
              >
                😂
              </Button>
              <Button
                variant="emoji"
                disabled={!isConnected}
                onClick={(e) => {
                  e.stopPropagation();
                  onReact(session.id, "😢");
                }}
                aria-label="React with cry"
              >
                😢
              </Button>
            </div>

            <div className={styles.removeGroup}>
              <Button
                variant="danger"
                disabled={!isConnected}
                onClick={handleRemove}
                aria-label={confirmDelete ? "Confirm delete session" : "Delete session"}
              >
                {confirmDelete ? "Confirm?" : "Remove"}
              </Button>
              {confirmDelete && (
                <Button
                  variant="default"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(false);
                  }}
                  aria-label="Cancel delete"
                  style={{ minHeight: "44px", padding: "6px 10px" }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
