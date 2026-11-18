"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { SessionDTO } from "@/lib/sessions/snapshot";
import { ClientMsg, ServerMsg } from "@/lib/realtime/protocol";
import { ConnectionState } from "./ConnectionStatus";
import { StartupScreen } from "./StartupScreen";

// IMPORTANT: defined outside the component so React never treats it as a new
// component type between renders. Keeping it inside would cause Console3D to
// fully unmount + remount (and reload all 9 OBJ files) on every state update.
const Console3D = dynamic(() => import("./Console3D"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "520px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--bone-dim)",
        fontFamily: "var(--font-pixel)",
        fontSize: "12px",
        letterSpacing: "1px",
      }}
    >
      Loading 3D Nintendo Console...
    </div>
  ),
});

interface BoardProps {
  initialSessions: SessionDTO[];
  initialCanEdit: boolean;
  initialMaxSessions: number;
}

export function Board({
  initialSessions,
  initialCanEdit,
  initialMaxSessions,
}: BoardProps) {
  const router = useRouter();
  const [showStartup, setShowStartup] = useState<boolean>(true);
  const [sessions, setSessions] = useState<SessionDTO[]>(initialSessions);
  const [canEdit, setCanEdit] = useState<boolean>(initialCanEdit);
  const [maxSessions, setMaxSessions] = useState<number>(initialMaxSessions);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>("reconnecting");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSessions.length > 0 ? initialSessions[0].id : null
  );

  const sessionsRef = useRef<SessionDTO[]>(sessions);
  sessionsRef.current = sessions;

  // Keep selectedId in a ref so the connect callback never needs it as a dep.
  // The WebSocket connection is independent of which session is currently selected.
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  const selectedSession = sessions.find((s) => s.id === selectedId) || sessions[0] || null;

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  // Send message helper
  const send = useCallback((msg: ClientMsg) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current);
    // If no message from server for 45s, reconnect
    heartbeatTimeoutRef.current = setTimeout(() => {
      console.warn("Realtime heartbeat timed out, reconnecting...");
      socketRef.current?.close();
    }, 45000);
  }, []);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus("reconnecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("live");
      reconnectAttemptsRef.current = 0;
      resetHeartbeat();
    };

    ws.onmessage = (event) => {
      resetHeartbeat();
      try {
        const msg: ServerMsg = JSON.parse(event.data);
        if (msg.type === "state") {
          // If a new session was added, automatically select it
          if (msg.sessions.length > sessionsRef.current.length) {
            const newest = msg.sessions[msg.sessions.length - 1];
            setSelectedId(newest.id);
          } else if (!selectedIdRef.current && msg.sessions.length > 0) {
            setSelectedId(msg.sessions[0].id);
          }
          setSessions(msg.sessions);
          setMaxSessions(msg.maxSessions);
          setCanEdit(msg.canEdit);
        } else if (msg.type === "react") {
          // Exactly one emoji in toast, no text message, no duplication
          toast(msg.emoji, {
            id: `react-${Date.now()}-${Math.random()}`,
            duration: 1600,
            style: {
              background: "rgba(23, 26, 24, 0.95)",
              color: "#e8e6dc",
              border: "1px solid var(--accent)",
              fontSize: "28px",
              padding: "6px 16px",
              borderRadius: "6px",
              boxShadow: "0 0 14px rgba(46, 139, 139, 0.4)",
            },
          });
        } else if (msg.type === "error") {
          toast.error(msg.message, {
            style: {
              background: "#171a18",
              color: "#e23b3b",
              border: "1px solid #e23b3b",
              fontFamily: "var(--font-pixel, monospace)",
              fontSize: "11px",
            },
          });
        }
      } catch (err) {
        console.error("Failed to parse incoming WS message:", err);
      }
    };

    ws.onclose = () => {
      setConnectionStatus("offline");
      if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current);

      // Exponential backoff reconnect
      const attempts = reconnectAttemptsRef.current;
      const baseDelay = Math.min(10000, 500 * Math.pow(2, attempts));
      const jitter = Math.random() * 300;
      const delay = baseDelay + jitter;
      reconnectAttemptsRef.current = attempts + 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [resetHeartbeat]);

  useEffect(() => {
    connect();

    // Foreground check: visibilitychange & online event
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    };

    const handleOnline = () => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [connect]);

  // Actions
  const handleIn = (id: string) => send({ type: "in", id });
  const handleOut = (id: string) => send({ type: "out", id });
  const handleRename = (id: string, name: string) => send({ type: "rename", id, name });
  const handleRemove = (id: string) => send({ type: "remove", id });
  const handleReact = (id: string, emoji: "😂" | "😢") => send({ type: "react", id, emoji });
  const handleAdd = (name: string) => send({ type: "add", name });

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setCanEdit(false);
      router.refresh();
      if (socketRef.current) {
        socketRef.current.close();
      }
      toast.success("Logged out successfully");
    } catch {
      window.location.reload();
    }
  };

  const isConnected = connectionStatus === "live";

  return (
    <>
      {showStartup && <StartupScreen onComplete={() => setShowStartup(false)} />}
      <Console3D
        selectedSession={selectedSession}
        sessions={sessions}
        canEdit={canEdit}
        isConnected={isConnected}
        connectionStatus={connectionStatus}
        maxSessions={maxSessions}
        onIn={handleIn}
        onOut={handleOut}
        onSelectSession={setSelectedId}
        onReact={handleReact}
        onRename={handleRename}
        onRemove={handleRemove}
        onAdd={handleAdd}
        onLogout={handleLogout}
      />
    </>
  );
}
