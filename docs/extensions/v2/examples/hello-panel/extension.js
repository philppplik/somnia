// hello-panel entry. On targets that advertise the js runtime, the host loads
// this bundle as an ES module and calls activate(somnia) after the handshake
// (browser targets advertise Wasm only today; others fail fast with
// E_INCOMPATIBLE_API). Register every command handler here.
export function activate(somnia) {
  somnia.commands.register("acme.hello-panel.say-hello", async () => {
    await somnia.ui.notify("Hello from your first Somnia extension.");
    return null;
  });
}

export function deactivate() {}
