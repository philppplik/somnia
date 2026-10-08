import { useState, useSyncExternalStore } from "react";
import {
  Zap as ActivityIcon,
  Sparkles,
  X,
  Upload,
  Lock as Shield,
} from "../lib/icons";
import { useT } from "../lib/useT";
import {
  getProfile,
  getActivity,
  subscribeAccount,
  updateProfile,
  avatarFromFile,
  activityWeeks,
  activityLevel,
  localDay,
  type LocalProfile,
} from "../lib/account";
import { Check } from "../lib/icons";
import { Button } from "./ui/button";
import { GithubConnection } from "./GithubConnection";
import { ProviderKeyConnection, OllamaConnection } from "./ProviderKeyConnection";
import { McpConnections } from "./McpConnections";
import { ProviderAccountConnection } from "./agent/ProviderAccountConnection";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

function User({
  size = 14,
  ...props
}: {
  size?: number;
  "aria-hidden"?: "true";
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      {...props}
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </svg>
  );
}
function Plug({ size = 14, ...props }: { size?: number; "aria-hidden"?: "true" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}
function Avatar({
  profile,
  large = false,
}: {
  profile: LocalProfile;
  large?: boolean;
}) {
  const { t } = useT();
  return (
    <span className={`account-avatar${large ? " account-avatar-large" : ""}`}>
      {profile.avatar ? (
        <img src={profile.avatar} alt={t("account.avatar")} />
      ) : profile.nickname.trim() ? (
        <span aria-hidden="true">
          {Array.from(profile.nickname.trim())[0].toLocaleUpperCase()}
        </span>
      ) : (
        <User aria-hidden="true" size={large ? 28 : 14} />
      )}
    </span>
  );
}
function Heatmap() {
  const { t, locale } = useT();
  const counts = useSyncExternalStore(
    subscribeAccount,
    getActivity,
    getActivity,
  );
  const weeks = activityWeeks();
  const days = weeks.flat().filter((d): d is Date => !!d);
  const total = days.reduce((sum, d) => sum + (counts[localDay(d)] || 0), 0);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  return (
    <>
      <div className="account-activity-total">
        <strong>{total.toLocaleString(locale)}</strong>
        <span>{t("account.contributions")}</span>
      </div>
      <div className="account-heatmap-card">
        <div
          className="account-heatmap-scroll"
          tabIndex={0}
          role="region"
          aria-label={t("account.heatmap")}
        >
          <div
            className="account-heatmap"
            style={{ gridTemplateColumns: `28px repeat(${weeks.length}, 8px)` }}
          >
            <span />
            {weeks.map((w, i) => {
              const d =
                w.find((d) => d?.getDate() === 1) ??
                (i === 0 ? w.find((d) => !!d) : null);
              return (
                <span className="account-month" key={i}>
                  {d
                    ? new Intl.DateTimeFormat(locale, {
                        month: "short",
                      }).format(d)
                    : ""}
                </span>
              );
            })}
            {Array.from({ length: 7 }, (_, row) => (
              <div className="account-heatmap-row" key={row}>
                <span className="account-weekday">
                  {[1, 3, 5].includes(row)
                    ? new Intl.DateTimeFormat(locale, {
                        weekday: "short",
                      }).format(
                        new Date(
                          days[0].getFullYear(),
                          days[0].getMonth(),
                          days[0].getDate() - days[0].getDay() + row,
                        ),
                      )
                    : ""}
                </span>
                {weeks.map((w, col) => {
                  const d = w[row];
                  const count = d ? counts[localDay(d)] || 0 : 0;
                  return (
                    <span
                      key={col}
                      className={`account-cell level-${activityLevel(count)}${d ? "" : " padding"}`}
                      tabIndex={d && count ? 0 : undefined}
                      aria-label={
                        d
                          ? t("account.day", { date: dateFmt.format(d), count })
                          : undefined
                      }
                      title={
                        d
                          ? t("account.day", { date: dateFmt.format(d), count })
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="account-legend">
          <span>{t("account.less")}</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={`account-cell level-${level}`}
              aria-hidden="true"
            />
          ))}
          <span>{t("account.more")}</span>
        </div>
      </div>
      <p>{t("account.counting")}</p>
      {total === 0 && (
        <div className="account-empty">
          <Sparkles size={18} />
          <span>{t("account.empty")}</span>
        </div>
      )}
    </>
  );
}

type Tier = {
  id: "pro" | "team" | "enterprise";
  perks: string[];
};
const TIERS: Tier[] = [
  { id: "pro", perks: ["inIndividual", "cloud", "credits"] },
  { id: "team", perks: ["inPro", "libraries", "roles"] },
  { id: "enterprise", perks: ["inTeam", "sso", "selfHost", "support"] },
];
function PricingCards() {
  const { t } = useT();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const price = (id: Tier["id"]) => {
    if (id === "enterprise")
      return { amount: t("account.price.custom"), unit: "" };
    if (id === "team")
      return { amount: "$19", unit: t("account.price.perUserMonth") };
    return billing === "monthly"
      ? { amount: "$12", unit: t("account.price.perMonth") }
      : { amount: "$120", unit: t("account.price.perYear") };
  };
  return (
    <div className="pricing">
      <div
        className="pricing-toggle"
        role="group"
        aria-label={t("account.price.billing")}
      >
        {(["monthly", "yearly"] as const).map((b) => (
          <button
            key={b}
            aria-pressed={billing === b}
            onClick={() => setBilling(b)}
          >
            {t("account.price." + b)}
          </button>
        ))}
      </div>
      <div className="pricing-grid">
        {TIERS.map(({ id, perks }) => {
          const { amount, unit } = price(id);
          const name = t("account.tier." + id);
          return (
            <div
              role="group"
              key={id}
              className={`pricing-card${id === "pro" ? " featured" : ""}`}
              aria-labelledby={"pricing-" + id}
            >
              <h3 id={"pricing-" + id}>{name}</h3>
              <div className="pricing-price">
                <strong>{amount}</strong>
                {unit && <span>{unit}</span>}
              </div>
              <p className="pricing-desc">
                {t("account.tier." + id + ".desc")}
              </p>
              <ul>
                {perks.map((k) => (
                  <li key={k}>
                    <Check size={14} aria-hidden="true" />
                    {t("account.perk." + k)}
                  </li>
                ))}
              </ul>
              <button
                className="pricing-select"
                aria-label={t("account.price.select", { plan: name })}
              >
                {t("account.price.choose")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function Account() {
  const { t } = useT();
  const profile = useSyncExternalStore(
    subscribeAccount,
    getProfile,
    getProfile,
  );
  const [open, setOpen] = useState(false),
    [section, setSection] = useState("profile"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const change = (patch: Partial<LocalProfile>) =>
    setError(updateProfile(patch) ? "" : "account.storageError");
  const sections = [
    { id: "profile", Icon: User },
    { id: "connections", Icon: Plug },
    { id: "activity", Icon: ActivityIcon },
    { id: "plan", Icon: Sparkles },
  ];
  return (
    <>
      <Button
        variant="outline"
        className="!h-8 rounded-[var(--r-control)] account-pill"
        aria-label={t("account.open")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="account-greeting">
          {profile.nickname.trim()
            ? t("account.hey", { name: profile.nickname.trim() })
            : t("account.title")}
        </span>
        <Avatar profile={profile} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="settings-popup account-popup">
          <aside className="settings-sidebar">
            <DialogTitle>{t("account.title")}</DialogTitle>
            <nav aria-label={t("account.sections")}>
              {sections.map(({ id, Icon }) => (
                <button
                  key={id}
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => {
                    setSection(id);
                    setError("");
                  }}
                >
                  <Icon size={16} />
                  {t("account." + id)}
                </button>
              ))}
            </nav>
            <div className="account-local-note">
              <Shield size={16} />
              <span>{t("account.local")}</span>
            </div>
          </aside>
          <div className="settings-main">
            <button
              className="settings-close"
              aria-label={t("account.close")}
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </button>
            <DialogDescription className="sr-only">
              {t("account.description")}
            </DialogDescription>
            <div className="settings-content account-content">
              <section>
                <h2>{t("account." + section)}</h2>
                {section === "profile" && (
                  <>
                    <p>{t("account.profileIntro")}</p>
                    <div className="account-profile-card">
                      <Avatar profile={profile} large />
                      <div>
                        <strong>
                          {profile.nickname.trim() || t("account.title")}
                        </strong>
                        <p>{t("account.local")}</p>
                      </div>
                    </div>
                    <label>
                      {t("account.nickname")}
                      <input
                        value={profile.nickname}
                        maxLength={40}
                        autoComplete="nickname"
                        placeholder={t("account.nicknamePlaceholder")}
                        onChange={(e) => change({ nickname: e.target.value })}
                      />
                    </label>
                    <div className="account-upload">
                      <div>
                        <h3>{t("account.avatar")}</h3>
                        <p>{t("account.imageHint")}</p>
                      </div>
                      <label className="account-upload-button">
                        <Upload size={14} />
                        {busy ? t("account.loading") : t("account.upload")}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={busy}
                          aria-label={t("account.upload")}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            setBusy(true);
                            try {
                              change({ avatar: await avatarFromFile(file) });
                            } catch {
                              setError("account.imageError");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      </label>
                      {profile.avatar && (
                        <button onClick={() => change({ avatar: "" })}>
                          {t("account.remove")}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {section === "connections" && (
                  <>
                    <div className="connection-card">
                      <h3>OpenAI</h3>
                      <ProviderAccountConnection provider="openai" showMethod={false} />
                    </div>
                    <GithubConnection />
                    <h3 className="connection-group">{t("conn.ai")}</h3>
                    <ProviderKeyConnection provider="claude" />
                    <ProviderKeyConnection provider="openrouter" />
                    <OllamaConnection />
                    <h3 className="connection-group">{t("conn.tools")}</h3>
                    <McpConnections onNavigate={() => setOpen(false)} />
                  </>
                )}
                {section === "activity" && <Heatmap />}
                {section === "plan" && (
                  <>
                    <p>{t("account.planIntro")}</p>
                    <div className="account-plan-card">
                      <div className="account-plan-heading">
                        <span>{t("account.currentPlan")}</span>
                        <span className="account-plan-badge">
                          {t("account.active")}
                        </span>
                      </div>
                      <h3>Free</h3>
                      <p>{t("account.freeDescription")}</p>
                      <div className="account-plan-features">
                        <span>{t("account.localFiles")}</span>
                        <span>{t("account.noCloud")}</span>
                      </div>
                    </div>
                    <PricingCards />
                    <p className="account-plan-note">
                      {t("account.noBilling")}
                    </p>
                  </>
                )}
                {error && (
                  <p role="alert" className="account-error">
                    {t(error)}
                  </p>
                )}
              </section>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
