import { useSyncExternalStore } from "react";
import { patchState } from "../../store/appStore";
import { getChatSession } from "./chatSession";
let tab: "agent" | "chat" = "agent";
const listeners = new Set<() => void>();
export function selectCommunication(next: "agent" | "chat") {
  tab = next;
  if(next==='agent')getChatSession()?.setOpen(false);
  listeners.forEach((f) => f());
}
export function openSessionChat() {
  selectCommunication("chat");
  patchState({ agentOpen: true });
}
export const useCommunicationTab = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    () => tab,
  );
