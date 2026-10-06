import { useSyncExternalStore } from "react";
import { getState, patchState } from "../../store/appStore";
import { getChatSession, subscribeChat } from "./chatSession";
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
/** Chat is session-only: when the session ends the panel falls back to the agent tab and stays open. */
subscribeChat(() => {
  if (!getChatSession() && tab === "chat") selectCommunication("agent");
});
/** Rail button and Mod+Alt+C: open the chat, or close the panel when the chat is already showing. */
export function toggleSessionChat() {
  if (!getChatSession()) return;
  if (getState().agentOpen && tab === "chat") patchState({ agentOpen: false });
  else openSessionChat();
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
