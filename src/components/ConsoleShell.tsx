import React from "react";
import styles from "@/styles/consoleShell.module.css";

interface ConsoleShellProps {
  canEdit: boolean;
  children: React.ReactNode;
}

export const ConsoleShell: React.FC<ConsoleShellProps> = ({ canEdit, children }) => {
  return (
    <div className={styles.wrapper}>
      <div className={styles.desktopLayout}>
        <div className={styles.consoleFrame}>
          {/* Top Bar for Desktop Handheld Frame */}
          <div className={styles.deviceTopBar}>
            <div className={styles.powerIndicator}>
              <span className={styles.powerLed} aria-hidden="true" />
              <span>POWER</span>
            </div>
            <div className={styles.consoleBranding}>HEADCOUNT ADVANCE</div>
          </div>

          {/* Screen Bezel */}
          <div className={styles.screenBezel}>
            <div className={styles.screenArea}>{children}</div>
          </div>

          {/* Decorative D-Pad & Action Buttons (Desktop Frame only) */}
          <div className={styles.deviceDecoration} aria-hidden="true">
            <div className={styles.dpad}>
              <div className={styles.dpadH} />
              <div className={styles.dpadV} />
            </div>
            <div className={styles.abButtons}>
              <div className={styles.roundBtn}>B</div>
              <div className={styles.roundBtn}>A</div>
            </div>
          </div>
        </div>

        {/* Legend Panel (Desktop & Operators only) */}
        {canEdit && (
          <aside className={styles.legendSidePanel} aria-label="Controls legend">
            <div>
              <div className={styles.legendHeading}>ACTIONS</div>
              <div className={styles.legendItem}>
                <span>STUDENT IN</span>
                <span className={styles.keyCap}>+ IN</span>
              </div>
              <div className={styles.legendItem}>
                <span>STUDENT OUT</span>
                <span className={styles.keyCap}>− OUT</span>
              </div>
            </div>

            <div>
              <div className={styles.legendHeading}>REACTIONS</div>
              <div className={styles.legendItem}>
                <span>LAUGH</span>
                <span className={styles.keyCap}>😂</span>
              </div>
              <div className={styles.legendItem}>
                <span>CRY</span>
                <span className={styles.keyCap}>😢</span>
              </div>
            </div>

            <div>
              <div className={styles.legendHeading}>SESSIONS</div>
              <div className={styles.legendItem}>
                <span>RENAME</span>
                <span className={styles.keyCap}>CLICK NAME</span>
              </div>
              <div className={styles.legendItem}>
                <span>REMOVE</span>
                <span className={styles.keyCap}>CONFIRM</span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
