import { useEffect, useSyncExternalStore } from "react";
import { patchState } from "../../store/appStore";
import { ShieldAlert } from "lucide-react";
import { ConfirmShell } from "../ConfirmShell";
import { SchemaForm } from "../SchemaForm";
import { Button } from "../ui/button";
import { useT } from "../../lib/useT";
import { getMcpRuntime, type McpRuntime } from "../../lib/agent/mcpRuntime";
const noop = () => () => {};
const empty = () => null;
/** One decision per call or server start: Deny, Allow once, or Allow for this session (a revocable, digest-bound broker grant). Shows exactly what will be sent or started. Closing or Escape means "no". */
export function McpApprovalDialog({
  runtime = getMcpRuntime(),
}: {
  runtime?: McpRuntime | null;
}) {
  const { t } = useT();
  const snap = useSyncExternalStore(
    runtime?.subscribe ?? noop,
    runtime?.getSnapshot ?? empty,
    runtime?.getSnapshot ?? empty,
  );
  const req = snap?.pending[0];
  /* A modal Settings dialog would hide this one (inert page). The decision must be visible, so Settings closes. */
  useEffect(() => {
    if (req) patchState({ settingsOpen: false });
  }, [req?.id]);
  if (!runtime || !req) return null;
  const toolSchema = snap.tools.find(
    (tool) => tool.server === req.server && tool.name === req.tool,
  )?.input_schema;
  const start = req.kind === "start";
  let args = JSON.stringify(req.args, null, 2);
  if (args.length > 4000) args = args.slice(0, 4000) + "\n…";
  return (
    <ConfirmShell
      open
      onCancel={() => runtime.decide(req.id, false)}
      tone="warning"
      Icon={ShieldAlert}
      alert
      ariaLabel={t(start ? "mcp.start.title" : "mcp.approve.title")}
      title={t(start ? "mcp.start.title" : "mcp.approve.title")}
      description={
        start
          ? t("mcp.start.desc", { server: req.server })
          : t("mcp.approve.desc", { tool: req.tool, server: req.server })
      }
      body={
        <div className="max-h-[45vh] overflow-auto">
          {!start && toolSchema && (
            <SchemaForm
              key={req.id}
              schema={toolSchema}
              initialValues={req.args}
              readOnly
            />
          )}
          <pre
            data-testid="mcp-approval-args"
            className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs"
          >
            {args}
          </pre>
        </div>
      }
      footer={
        <>
          <Button
            onClick={() => runtime.decide(req.id, false)}
            data-testid="mcp-deny"
          >
            {t("mcp.approve.deny")}
          </Button>
          <Button
            onClick={() => runtime.decide(req.id, "allow_once")}
            data-testid="mcp-allow"
          >
            {t("mcp.approve.allow")}
          </Button>
          <Button
            variant="primary"
            onClick={() => runtime.decide(req.id, "allow_for_run")}
            data-testid="mcp-allow-run"
          >
            {t("mcp.approve.allowRun")}
          </Button>
        </>
      }
    />
  );
}
