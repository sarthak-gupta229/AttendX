"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import styles from "@/styles/login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.error === "rate_limited") {
          setError("Too many attempts. Please try again later.");
        } else {
          setError("Invalid email or password.");
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>AttendX Login</h1>
          <div className={styles.subtitle}>\Operator Access</div>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label htmlFor="email" className={styles.label}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck="false"
              required
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !email || !password}
            className={styles.submitBtn}
          >
            {loading ? "Signing In..." : "Sign In"}
          </Button>
        </form>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/signup" className={styles.backLink} aria-label="Don't have an account? Sign up">
            No account? Sign Up
          </Link>
          <Link href="/" className={styles.backLink} aria-label="Return to live board">
            ← Back to Board
          </Link>
        </div>
      </div>
    </div>
  );
}
