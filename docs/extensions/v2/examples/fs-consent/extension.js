// fs-consent entry. The [security.fs] read = "ask" declaration is the stable,
// validated part of this example: the install review shows it, and the consent
// engine (docs/extensions/v2/permissions-security.md) gates every call.
//
// The guest-side `somnia.fs` bridge exists only on targets that wire the
// trusted filesystem service; targets without it reject with
// E_INCOMPATIBLE_API, and a denied prompt rejects with E_PERMISSION_DENIED.
export function activate(somnia) {
  somnia.commands.register("acme.fs-consent.import-file", async () => {
    if (typeof somnia.fs?.readFile !== "function") {
      await somnia.ui.notify("File import needs a Somnia version with the fs consent service.");
      return null;
    }
    try {
      // One runtime prompt per target; "once" authorizes exactly this call.
      const file = await somnia.fs.readFile({ prompt: "Pick one text file to import" });
      await somnia.ui.notify(`Imported ${file.path} (${file.text.length} characters).`);
      return { path: file.path, characters: file.text.length };
    } catch (error) {
      if (error?.code === "E_PERMISSION_DENIED") {
        // Explain once, never nag. The user can re-grant in Settings.
        await somnia.ui.notify("Import cancelled: file access was not allowed.");
        return null;
      }
      throw error;
    }
  });
}

export function deactivate() {}
