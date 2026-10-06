import { useSyncExternalStore } from "react";
import {
  getBadgeMode,
  onBadgeMode,
  setBadgeMode,
  type BadgeMode,
} from "../lib/collab/badgePolicy";
import { useT } from "../lib/useT";
export function CollabPreferences() {
  const { t } = useT();
  const mode = useSyncExternalStore(onBadgeMode, getBadgeMode);
  return (
    <div className="collab-preferences">
      <p>{t("chat.badges")}</p>
      <div role="group" aria-label={t("chat.badges")}>
        {(["activity", "always", "never"] as BadgeMode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setBadgeMode(m)}
          >
            {t("chat." + m)}
          </button>
        ))}
      </div>
    </div>
  );
}
