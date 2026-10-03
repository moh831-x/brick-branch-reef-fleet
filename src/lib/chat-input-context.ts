import { createContext } from "react";
export type ImageInputTarget = { id: string; send: (prompt: string) => void; placeholder: string; initial: string; available: boolean; busy: boolean };
export type ChatInputBridge = {
  register: (send: ((question: string) => void) | null) => void;
  setBusy: (busy: boolean) => void;
  activateImage: (target: ImageInputTarget) => void;
  closeImage: (id: string) => void;
  activeImageId: string | null;
};
export const ChatInputContext = createContext<ChatInputBridge | null>(null);
