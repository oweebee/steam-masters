"use client";

import { useEffect, useRef, useState } from "react";

export function FlameDial() {
  const dialRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const dial = dialRef.current;
    const video = videoRef.current;
    if (!dial || !video) return;
    let active = false;
    const attach = () => {
      if (active) return;
      active = true;
      void video.play().then(() => { if (active) setPlaying(true); }).catch(() => setPlaying(false));
    };
    const detach = () => {
      active = false;
      video.pause();
      setPlaying(false);
    };

    if (typeof IntersectionObserver === "undefined") attach();
    else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) attach();
        else detach();
      }, { rootMargin: "120px" });
      observer.observe(dial);
      return () => { observer.disconnect(); detach(); };
    }
    return detach;
  }, []);

  return <span ref={dialRef} className="steam-card-image-dial" data-playing={playing} aria-hidden="true">
    <video ref={videoRef} className="steam-card-flame-video" src="/flame/real-fire.webm" muted loop playsInline preload="none" disablePictureInPicture />
    <span className="steam-card-flame-fallback" />
  </span>;
}
