import { useEffect } from "react";
import { AgentPanel } from "./agent/AgentPanel";
import { SessionChat } from "./SessionChat";
import { useT } from "../lib/useT";
import {
  useCommunicationTab,
  selectCommunication,
} from "../lib/collab/communication";
import { getChatSession } from "../lib/collab/chatSession";
import { patchState } from "../store/appStore";
export function CommunicationPanel() {
  const tab = useCommunicationTab(),
    { t } = useT();
  useEffect(
    () => () => {
      getChatSession()?.setOpen(false);
    },
    [],
  );
  return (
    <div className="communication-panel">
      <div
        className="communication-tabs"
        role="tablist"
        aria-label={t("chat.communication")}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const next = tab === "agent" ? "chat" : "agent";
            selectCommunication(next);
            document.getElementById("communication-" + next)?.focus();
          }
        }}
      >
        <button
          id="communication-agent"
          role="tab"
          aria-selected={tab === "agent"}
          aria-controls="communication-content"
          onClick={() => selectCommunication("agent")}
        >
          {t("chat.agent")}
        </button>
        <button
          id="communication-chat"
          role="tab"
          aria-selected={tab === "chat"}
          aria-controls="communication-content"
          onClick={() => selectCommunication("chat")}
        >
          {t("chat.tab")}
        </button>
        <button
          className="communication-close"
          aria-label={t("chat.close")}
          onClick={() => patchState({ agentOpen: false })}
        >
          ×
        </button>
      </div>
      <div
        className="communication-content"
        id="communication-content"
        role="tabpanel"
        aria-labelledby={"communication-" + tab}
      >
        <div className="communication-agent" hidden={tab !== "agent"}>
          <AgentPanel />
        </div>
        {tab === "chat" && <SessionChat />}
      </div>
    </div>
  );
}
