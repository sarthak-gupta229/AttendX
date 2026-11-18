import React from "react";
import styles from "@/styles/connectionStatus.module.css";

export type ConnectionState = "live" | "reconnecting" | "offline";

interface ConnectionStatusProps {
  status: ConnectionState;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  let label = "Offline";
  let dotClass = styles.offline;

  if (status === "live") {
    label = "Live";
    dotClass = styles.live;
  } else if (status === "reconnecting") {
    label = "Reconnecting";
    dotClass = styles.reconnecting;
  }

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <span className={`${styles.dot} ${dotClass}`} aria-hidden="true" />
      <span className={styles.text}>{label}</span>
    </div>
  );
};
