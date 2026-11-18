import React from "react";
import styles from "@/styles/ui.module.css";

interface PixelLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  as?: "span" | "div" | "p" | "h2" | "h3";
}

export const PixelLabel: React.FC<PixelLabelProps> = ({
  as: Component = "span",
  className = "",
  children,
  ...props
}) => {
  return (
    <Component className={`${styles.pixelLabel} ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
};
