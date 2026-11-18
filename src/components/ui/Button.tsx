import React from "react";
import styles from "@/styles/ui.module.css";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "in" | "out" | "emoji" | "danger";
}

export const Button: React.FC<ButtonProps> = ({
  variant = "default",
  className = "",
  children,
  ...props
}) => {
  let variantClass = styles.button;
  if (variant === "in") variantClass = `${styles.button} ${styles.inButton}`;
  if (variant === "out") variantClass = `${styles.button} ${styles.outButton}`;
  if (variant === "emoji") variantClass = `${styles.button} ${styles.emojiButton}`;
  if (variant === "danger") variantClass = `${styles.button} ${styles.dangerButton}`;

  return (
    <button className={`${variantClass} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
};
