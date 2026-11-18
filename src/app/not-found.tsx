import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--bone)", fontFamily: "var(--font-pixel)" }}>
      <h2>404 - Not Found</h2>
      <p style={{ marginTop: "12px", color: "var(--bone-dim)", fontSize: "12px" }}>The requested page does not exist.</p>
      <Link href="/" style={{ color: "var(--accent)", marginTop: "16px", display: "inline-block" }}>
        Return Home
      </Link>
    </div>
  );
}
