import { useEffect } from "react";
import { startNativeShell } from "@/lib/native";

/** Wires iOS-app behaviour (status bar, splash, in-app links). Renders nothing; no-op in browsers. */
export function NativeShell() {
  useEffect(() => startNativeShell(), []);
  return null;
}
