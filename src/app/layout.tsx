import type { Metadata, Viewport } from "next";
import { Handjet, Press_Start_2P } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "@/styles/globals.css";
import Starfield from "@/components/Starfield";

const handjet = Handjet({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-handjet",
  display: "swap",
});

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start-2p",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AttendX - Live Headcount Board",
  description: "AttendX live headcount board for classroom and room tracking",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1110",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${handjet.variable} ${pressStart2P.variable}`}>
      <body>
        <Starfield />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#171a18",
              color: "#e8e6dc",
              border: "1px solid #2e8b8b",
              fontFamily: "var(--font-pixel)",
              fontSize: "12px",
              borderRadius: "0px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.8)",
            },
            duration: 3000,
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            minHeight: "100dvh",
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
          }}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
