import React from "react";
import styles from "@/styles/ui.module.css";

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Panel: React.FC<PanelProps> = ({ className = "", children, ...props }) => {
  return (
    <div className={`${styles.panel} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
};
