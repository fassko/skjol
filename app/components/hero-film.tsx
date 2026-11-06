"use client";

import { useEffect, useRef } from "react";

export function HeroFilm() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (motion.matches) {
        video.pause();
      } else {
        void video.play().catch(() => {});
      }
    };
    apply();
    motion.addEventListener("change", apply);
    return () => motion.removeEventListener("change", apply);
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#fffdf8]">
      <video
        ref={ref}
        className="block aspect-video w-full object-cover"
        src="/pitch.mp4"
        muted
        loop
        playsInline
        autoPlay
        controls
        preload="metadata"
        aria-label="Skjol: a late ship, a claims pool, and a fixed payout"
      />
    </div>
  );
}
