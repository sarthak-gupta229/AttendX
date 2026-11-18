"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  phase: number;
  twinkleSpeed: number;
  speed: number;
  isSpecial: boolean;
}

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", onResize);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Generate ~100 stars with varying brightness and twinkle phases
    const numStars = Math.max(60, Math.floor((width * height) / 12000));
    const stars: Star[] = [];

    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() < 0.15 ? 1.8 : Math.random() < 0.4 ? 1.2 : 0.8,
        baseAlpha: 0.2 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.05,
        speed: 0.04 + Math.random() * 0.08,
        isSpecial: Math.random() < 0.1, // 10% stars have cross-sparkle
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (const star of stars) {
        if (!prefersReducedMotion) {
          star.phase += star.twinkleSpeed;
          star.y += star.speed;
          if (star.y > height) {
            star.y = 0;
            star.x = Math.random() * width;
          }
        }

        // Twinkle factor using sine oscillation
        const twinkle = Math.sin(star.phase);
        const alpha = Math.min(1, Math.max(0.08, star.baseAlpha + twinkle * 0.35));

        ctx.fillStyle = star.isSpecial ? "#d5f3f3" : "#ffffff";
        ctx.globalAlpha = alpha;

        const ix = Math.floor(star.x);
        const iy = Math.floor(star.y);

        ctx.fillRect(ix, iy, star.r, star.r);

        // Subtle 4-point sparkle for special bright stars at peak twinkle
        if (star.isSpecial && twinkle > 0.6) {
          ctx.globalAlpha = (twinkle - 0.6) * 0.5;
          ctx.fillRect(ix - 2, iy, star.r + 4, star.r);
          ctx.fillRect(ix, iy - 2, star.r, star.r + 4);
        }
      }

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener("resize", onResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="starfield-bg" aria-hidden="true" />;
}
