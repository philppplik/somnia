// network-host-scope entry. The [[security.network]] declaration is exact: one
// lowercase host, a case-sensitive path prefix, a review-visible reason.
// The host proxy enforces HTTPS, no redirects across hosts, no ambient cookies
// or Authorization headers, a 10 MiB response cap, 15 s timeout, 60 req/min.
// The `somnia.net` bridge is provided by the trusted network service on targets
// that wire it (docs/extensions/v2/permissions-security.md).
export function activate(somnia) {
  somnia.commands.register("acme.network-host-scope.check-releases", async () => {
    if (typeof somnia.net?.fetch !== "function") {
      await somnia.ui.notify("Release checks need a Somnia version with the network service.");
      return null;
    }
    try {
      const response = await somnia.net.fetch(
        "https://api.github.com/repos/philppplik/somnia/releases?per_page=1"
      );
      if (!response.ok) {
        await somnia.ui.notify(`Release check failed: host answered ${response.status}.`);
        return null;
      }
      const [latest] = JSON.parse(response.body);
      await somnia.ui.notify(latest ? `Latest release: ${latest.tag_name}` : "No releases yet.");
      return latest?.tag_name ?? null;
    } catch (error) {
      if (error?.code === "E_PERMISSION_DENIED") {
        await somnia.ui.notify("Network access was not allowed for this extension.");
        return null;
      }
      if (error?.code === "E_TIMEOUT" || error?.code === "E_CANCELLED") {
        await somnia.ui.notify("You appear to be offline. Try again later.");
        return null;
      }
      throw error;
    }
  });
}

export function deactivate() {}
