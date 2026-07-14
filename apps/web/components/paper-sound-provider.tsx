"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const STORAGE_KEY = "is2u.paper-sound";
const SOUND_FILES = {
  "paper-tap": "/sounds/paper-tap.mp3",
  "note-stick": "/sounds/note-stick.mp3",
  "page-open": "/sounds/page-open.mp3",
  "note-peel": "/sounds/note-peel.mp3",
  "save-soft": "/sounds/save-soft.mp3",
  "close-paper": "/sounds/close-paper.mp3",
} as const;
type SoundName = keyof typeof SOUND_FILES;

const PaperSoundContext = createContext<{ enabled: boolean; setEnabled: (enabled: boolean) => void }>({ enabled: true, setEnabled: () => undefined });

export function PaperSoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(true);
  const audio = useRef(new Map<SoundName, HTMLAudioElement>());
  const lastPlayed = useRef(new Map<SoundName, number>());

  useEffect(() => { setEnabledState(localStorage.getItem(STORAGE_KEY) !== "off"); }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  }, []);

  const play = useCallback((name: SoundName) => {
    if (!enabled) return;
    const now = performance.now();
    if (now - (lastPlayed.current.get(name) ?? 0) < 120) return;
    lastPlayed.current.set(name, now);
    try {
      let player = audio.current.get(name);
      if (!player) {
        player = new Audio(SOUND_FILES[name]);
        player.preload = "metadata";
        player.volume = 0.12;
        audio.current.set(name, player);
      }
      player.currentTime = 0;
      void player.play().catch(() => undefined);
    } catch {
      // Sound is decorative. A playback failure must never block the action.
    }
  }, [enabled]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-paper-sound],button,a") : null;
      if (!target || target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;
      const requested = target.dataset.paperSound;
      const name = requested && requested in SOUND_FILES ? requested as SoundName : "paper-tap";
      play(name);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [play]);

  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);
  return <PaperSoundContext.Provider value={value}>{children}</PaperSoundContext.Provider>;
}

export function usePaperSoundSetting() {
  return useContext(PaperSoundContext);
}
