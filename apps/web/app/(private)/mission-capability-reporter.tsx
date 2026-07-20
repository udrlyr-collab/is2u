"use client";

import { useEffect } from "react";
import { apiFetch } from "../../lib/client";

export function MissionCapabilityReporter() {
  useEffect(() => {
    const capabilities: Array<"microphone" | "camera" | "media-library"> = [];
    if (typeof window.File === "function" && typeof window.FileReader === "function") capabilities.push("media-library");
    const canCapture = typeof navigator.mediaDevices?.getUserMedia === "function";
    if (canCapture) capabilities.push("camera");
    if (typeof window.MediaRecorder === "function" && canCapture) capabilities.push("microphone");
    void apiFetch("/api/settings/capabilities", {
      method: "POST",
      body: JSON.stringify({ capabilities }),
    }).catch(() => undefined);
  }, []);
  return null;
}
