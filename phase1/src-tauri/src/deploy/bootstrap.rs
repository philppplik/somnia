//! One-time server bootstrap: render the reviewed script, run it once with sudo over SSH.
//!
//! The same script is shown in full in the wizard (copy-paste path) and can be run by Somnia
//! when the user supplies a sudo-capable login. After it ran, deploys use the unprivileged
//! `somnia` user and never need root again.
//!
//! Rules: the script is rendered from validated fields only (no free text reaches the shell);
//! a sudo password is sent on stdin, never in argv, never stored and always redacted from output;
//! the script is staged in a private temp file that is deleted afterwards; the same staged
//! bytes must pass a read-only elevated dry-run before any setup mutation.
use super::{manifest::valid_id, ssh::SshExec, DeployError, Result};
use zeroize::Zeroizing;

/// Reload Caddy through its unix admin socket. Run as `somnia`, no sudo.
pub const CADDY_RELOAD_COMMAND: &str =
    "caddy reload --config /etc/somnia/Caddyfile --address unix//run/somnia/caddy-admin.sock --force";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BootstrapParams {
    /// Site directory name under `/srv/somnia` (same rules as release layout ids).
    pub site: String,
    /// Public half of the deployment key, one `ssh-ed25519 AAAA... [comment]` line.
    pub public_key: String,
    /// Node and SSR apps: also enable lingering so user services survive logout.
    pub node: bool,
}

impl BootstrapParams {
    pub fn validate(&self) -> Result<()> {
        let key_ok = {
            let mut parts = self.public_key.split(' ');
            let kind = parts.next().unwrap_or("");
            let blob = parts.next().unwrap_or("");
            let comment = parts.collect::<Vec<_>>().join(" ");
            matches!(
                kind,
                "ssh-ed25519"
                    | "ecdsa-sha2-nistp256"
                    | "ecdsa-sha2-nistp384"
                    | "ecdsa-sha2-nistp521"
                    | "ssh-rsa"
            ) && !blob.is_empty()
                && blob.len() <= 2048
                && blob
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))
                && comment.len() <= 128
                && comment.bytes().all(|b| {
                    b.is_ascii_alphanumeric()
                        || matches!(b, b'@' | b'.' | b'_' | b'-' | b' ' | b':')
                })
        };
        if !valid_id(&self.site) || self.site.len() > 40 || !key_ok {
            return Err(DeployError::InvalidInput);
        }
        Ok(())
    }
}

/// Plain-language list of what the script does, for the "what does this do" panel.
pub const SCRIPT_STEPS: [&str; 7] = ["ports", "caddy", "user", "key", "dirs", "config", "start"];

pub fn render_script(p: &BootstrapParams) -> Result<String> {
    p.validate()?;
    let linger = if p.node {
        "say linger\nloginctl enable-linger somnia\n"
    } else {
        ""
    };
    Ok(format!(
        r#"#!/bin/sh
# Somnia one-time server setup. Safe to run again. Reviewed text, no hidden steps.
set -eu
say() {{ printf 'SOMNIA_STEP %s\n' "$1"; }}
fail() {{ printf 'SOMNIA_ERROR %s\n' "$1"; exit "${{2:-1}}"; }}
case "${{1:-}}" in ''|--dry-run) ;; *) fail invalid_mode 14 ;; esac
printf 'SOMNIA_BOOTSTRAP_STARTED\n'
[ "$(id -u)" = 0 ] || fail not_root 10
. /etc/os-release 2>/dev/null || fail unsupported_os 11
case "${{ID:-}} ${{ID_LIKE:-}}" in *debian*|*ubuntu*) ;; *) fail unsupported_os 11 ;; esac
command -v systemctl >/dev/null 2>&1 || fail no_systemd 12
case "$(uname -m)" in x86_64|aarch64) ;; *) fail unsupported_arch 13 ;; esac

# Fail closed: without socket ownership information a setup must not assume ports are free.
say ports
command -v ss >/dev/null 2>&1 || fail no_socket_probe 15
managed_pid=$(systemctl show -p MainPID --value somnia-caddy.service 2>/dev/null || true)
case "$managed_pid" in ''|*[!0-9]*|0|1) managed_pid=none ;; esac
for port in 80 443; do
  owners=$(ss -H -ltnp "sport = :$port" 2>/dev/null) || fail socket_probe_failed 16
  if [ -n "$owners" ]; then
    # Never take over another Caddy, nginx or Apache. Every listener must belong to our service.
    while IFS= read -r owner; do
      case "$owner" in
        *'"caddy"'*"pid=$managed_pid,"*)
          pids=$(printf '%s' "$owner" | grep -o 'pid=[0-9]*' | sort -u)
          [ "$pids" = "pid=$managed_pid" ] || fail "port_in_use_$port" 20
          ;;
        *) fail "port_in_use_$port" 20 ;;
      esac
    done <<OWNERS
$owners
OWNERS
  fi
done
# A dry-run performs only reads, including when invoked with sudo. No package manager,
# user/key/file change, daemon reload or service stop can happen before this return.
if [ "${{1:-}}" = --dry-run ]; then
  printf 'SOMNIA_DRY_RUN_READY\n'
  exit 0
fi

say caddy
installed_caddy=0
if ! command -v caddy >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq || fail apt_update 30
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gpg || fail apt_install 31
  tmp=$(mktemp -d)
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$tmp/caddy.gpg" || fail caddy_download 32
  gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg "$tmp/caddy.gpg" || fail caddy_download 32
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list || fail caddy_download 32
  rm -rf "$tmp"
  apt-get update -qq || fail apt_update 30
  apt-get install -y -qq caddy || fail caddy_install 33
  installed_caddy=1
fi
# The package may auto-start its stock service. Only stop that newly installed default;
# an existing unrelated service is never disabled by Somnia.
if [ "$installed_caddy" = 1 ]; then
  systemctl disable --now caddy >/dev/null 2>&1 || fail caddy_stop 34
fi

say user
id somnia >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/somnia --shell /bin/bash --user-group somnia || fail useradd 40

say key
install -d -m 700 -o somnia -g somnia /var/lib/somnia/.ssh
touch /var/lib/somnia/.ssh/authorized_keys
grep -qxF '{key}' /var/lib/somnia/.ssh/authorized_keys || printf '%s\n' '{key}' >> /var/lib/somnia/.ssh/authorized_keys
chown somnia:somnia /var/lib/somnia/.ssh/authorized_keys
chmod 600 /var/lib/somnia/.ssh/authorized_keys

say dirs
install -d -m 755 -o somnia -g somnia /srv/somnia "/srv/somnia/{site}" "/srv/somnia/{site}/releases" "/srv/somnia/{site}/shared"
install -d -m 755 -o somnia -g somnia /etc/somnia

say config
if [ ! -f /etc/somnia/Caddyfile ]; then
  cat > /etc/somnia/Caddyfile <<'CADDY'
{{
	admin unix//run/somnia/caddy-admin.sock
}}
import /srv/somnia/*/Caddyfile
CADDY
  chown somnia:somnia /etc/somnia/Caddyfile
fi
cat > /etc/systemd/system/somnia-caddy.service <<'UNIT'
[Unit]
Description=Somnia web server (Caddy)
After=network-online.target
Wants=network-online.target

[Service]
User=somnia
Group=somnia
RuntimeDirectory=somnia
Environment=XDG_DATA_HOME=/var/lib/somnia/data XDG_CONFIG_HOME=/var/lib/somnia/config
ExecStart=/usr/bin/caddy run --environ --config /etc/somnia/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/somnia/Caddyfile --address unix//run/somnia/caddy-admin.sock --force
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=1048576
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT
{linger}
say start
systemctl daemon-reload
systemctl enable --now somnia-caddy.service || fail caddy_start 50
for f in /etc/ssh/ssh_host_ed25519_key.pub; do
  if [ -f "$f" ]; then printf 'SOMNIA_HOSTKEY_ED25519 %s\n' "$(ssh-keygen -lf "$f" | awk '{{print $2}}')"; fi
done
printf 'SOMNIA_DONE\n'
"#,
        key = p.public_key,
        site = p.site,
        linger = linger,
    ))
}

/// How the setup gets root.
pub enum Privilege {
    /// The login already is root.
    Root,
    /// `sudo -n`: passwordless sudo.
    SudoPasswordless,
    /// `sudo -S`: the password is written to stdin, never to argv, and is not stored.
    SudoPassword(Zeroizing<String>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BootstrapOutcome {
    Done,
    /// sudo refused: wrong password, or the user may not use sudo.
    SudoDenied,
    UnsupportedServer(String),
    /// Something else already listens on this port (80 or 443). Nothing was changed.
    PortInUse(u16),
    Failed(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BootstrapReport {
    pub outcome: BootstrapOutcome,
    pub steps: Vec<String>,
    /// `SHA256:...` of the server's ed25519 host key, for the pasted-fingerprint check.
    pub host_fingerprint: Option<String>,
}

/// Parses the marker lines the script prints. Unknown lines (package manager chatter) are ignored.
pub fn parse_output(stdout: &str, status: Option<u32>) -> BootstrapReport {
    let mut steps = vec![];
    let (mut fingerprint, mut started, mut done, mut error) = (None, false, false, None);
    for line in stdout.lines() {
        let line = line.trim();
        if line == "SOMNIA_BOOTSTRAP_STARTED" {
            started = true;
        } else if line == "SOMNIA_DONE" {
            done = true;
        } else if let Some(s) = line.strip_prefix("SOMNIA_STEP ") {
            if s.len() <= 32 && s.bytes().all(|b| b.is_ascii_lowercase()) {
                steps.push(s.to_owned());
            }
        } else if let Some(f) = line.strip_prefix("SOMNIA_HOSTKEY_ED25519 ") {
            if f.starts_with("SHA256:") && f.len() == 50 {
                fingerprint = Some(f.to_owned());
            }
        } else if let Some(e) = line.strip_prefix("SOMNIA_ERROR ") {
            error = Some(e.to_owned());
        }
    }
    let outcome = if done && status == Some(0) {
        BootstrapOutcome::Done
    } else if !started {
        BootstrapOutcome::SudoDenied
    } else {
        match error.as_deref() {
            Some("unsupported_os" | "no_systemd" | "unsupported_arch" | "no_socket_probe") => {
                BootstrapOutcome::UnsupportedServer(error.clone().unwrap())
            }
            Some("port_in_use_80") => BootstrapOutcome::PortInUse(80),
            Some("port_in_use_443") => BootstrapOutcome::PortInUse(443),
            Some(other) => BootstrapOutcome::Failed(other.chars().take(40).collect()),
            None => BootstrapOutcome::Failed("unknown".into()),
        }
    };
    BootstrapReport {
        outcome,
        steps,
        host_fingerprint: fingerprint,
    }
}

/// Stage the script privately, run it with the chosen privilege, always delete it again.
/// `Err` means the transport failed; a refused sudo or a failed step is a [`BootstrapReport`].
pub async fn run<E: SshExec>(
    exec: &mut E,
    params: &BootstrapParams,
    privilege: Privilege,
    progress: &dyn Fn(&str),
) -> Result<BootstrapReport> {
    let script = render_script(params)?;
    progress("upload");
    let staged = exec
        .exec(
            "umask 077 && f=$(mktemp /tmp/somnia-bootstrap.XXXXXXXX) && cat > \"$f\" && printf '%s' \"$f\"",
            Some(script.as_bytes()),
        )
        .await?;
    let path = staged.stdout.trim().to_owned();
    let valid_path = staged.success()
        && path
            .strip_prefix("/tmp/somnia-bootstrap.")
            .is_some_and(|t| t.len() == 8 && t.bytes().all(|b| b.is_ascii_alphanumeric()));
    if !valid_path {
        return Err(DeployError::Transport);
    }
    let (command, stdin): (String, Option<Zeroizing<Vec<u8>>>) = match &privilege {
        Privilege::Root => (format!("/bin/sh {path}"), None),
        Privilege::SudoPasswordless => (format!("sudo -n -- /bin/sh {path}"), None),
        Privilege::SudoPassword(pw) => (
            format!("sudo -S -p '' -- /bin/sh {path}"),
            Some(Zeroizing::new(format!("{}\n", pw.as_str()).into_bytes())),
        ),
    };
    // Check the reviewed, staged bytes using exactly the same privilege as the apply.
    // Each sudo invocation gets its own stdin; a timestamp cache is not assumed.
    progress("preflight");
    let checked = exec
        .exec(
            &format!("{command} --dry-run"),
            stdin.as_deref().map(|v| v.as_slice()),
        )
        .await;
    let ready = checked.as_ref().is_ok_and(|out| {
        out.success()
            && out
                .markers
                .iter()
                .any(|line| line == "SOMNIA_DRY_RUN_READY")
    });
    let ran = if ready {
        progress("run");
        exec.exec(&command, stdin.as_deref().map(|v| v.as_slice()))
            .await
    } else {
        checked
    };
    // Cleanup must happen on preflight refusal, apply failure and transport failure alike.
    let _ = exec.exec(&format!("rm -f {path}"), None).await;
    let output = ran?;
    let mut report = parse_output(&output.markers.join("\n"), output.status);
    if !ready && report.outcome == BootstrapOutcome::Done {
        // DONE is not a substitute for a successful dry-run marker.
        report.outcome = BootstrapOutcome::Failed("preflight".into());
    }
    for step in &report.steps {
        progress(step);
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deploy::{
        host_keys::HostKeyStore,
        ssh::{ConnectOptions, Credential, RusshTransport, SshTarget},
        ssh_testkit::TestServer,
    };
    use std::sync::{Arc, Mutex};

    const KEY: &str = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoFKLEsw3DFw6e2cpQvDbmjZsvx somnia@deploy";
    fn params(node: bool) -> BootstrapParams {
        BootstrapParams {
            site: "my-site".into(),
            public_key: KEY.into(),
            node,
        }
    }

    #[test]
    fn script_is_posix_sh_and_idempotent_by_construction() {
        let script = render_script(&params(true)).unwrap();
        for needle in [
            "useradd --system",
            "AmbientCapabilities=CAP_NET_BIND_SERVICE",
            "import /srv/somnia/*/Caddyfile",
            "loginctl enable-linger somnia",
            "ssh-keygen -lf",
            "grep -qxF",
        ] {
            assert!(script.contains(needle), "missing {needle}");
        }
        assert!(!render_script(&params(false))
            .unwrap()
            .contains("enable-linger"));
        // No sudo rule, no setuid, no root SSH.
        for banned in ["sudoers", "chmod u+s", "PermitRootLogin", "NOPASSWD"] {
            assert!(!script.contains(banned));
        }
        #[cfg(unix)]
        {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join("bootstrap.sh");
            std::fs::write(&file, &script).unwrap();
            for shell in ["/bin/sh", "/bin/dash", "/bin/bash"] {
                if std::path::Path::new(shell).exists() {
                    let out = std::process::Command::new(shell)
                        .arg("-n")
                        .arg(&file)
                        .output()
                        .unwrap();
                    assert!(
                        out.status.success(),
                        "{shell} -n failed: {}",
                        String::from_utf8_lossy(&out.stderr)
                    );
                }
            }
        }
    }

    #[test]
    fn script_rejects_shell_injection_through_every_field() {
        for site in ["a'; rm -rf /; '", "Site", "a b", "", "$(id)", "a/../b"] {
            let mut p = params(false);
            p.site = site.into();
            assert_eq!(
                render_script(&p).unwrap_err(),
                DeployError::InvalidInput,
                "{site}"
            );
        }
        for key in [
            "ssh-ed25519 AAAA'; id; echo '",
            "ssh-ed25519 AAAA$(id)",
            "ssh-ed25519 AAAA comment'quote",
            "ssh-ed25519 AAAA\nssh-ed25519 BBBB",
            "rm -rf /",
            "",
            "ssh-ed25519 AAAA comment`id`",
        ] {
            let mut p = params(false);
            p.public_key = key.into();
            assert_eq!(
                render_script(&p).unwrap_err(),
                DeployError::InvalidInput,
                "{key:?}"
            );
        }
    }

    #[test]
    fn output_parser_maps_markers_and_ignores_noise() {
        let fp = format!("SHA256:{}", "A".repeat(43));
        let ok = format!("apt chatter\nSOMNIA_BOOTSTRAP_STARTED\nSOMNIA_STEP caddy\nSOMNIA_STEP user\nSOMNIA_HOSTKEY_ED25519 {fp}\nSOMNIA_DONE\n");
        let r = parse_output(&ok, Some(0));
        assert_eq!(r.outcome, BootstrapOutcome::Done);
        assert_eq!(r.steps, ["caddy", "user"]);
        assert_eq!(r.host_fingerprint.as_deref(), Some(fp.as_str()));
        // A forged DONE with a failing exit status is not success.
        assert_ne!(parse_output(&ok, Some(1)).outcome, BootstrapOutcome::Done);
        assert_eq!(
            parse_output("Sorry, try again.\n", Some(1)).outcome,
            BootstrapOutcome::SudoDenied
        );
        let port = "SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_ERROR port_in_use_443\n";
        assert_eq!(
            parse_output(port, Some(20)).outcome,
            BootstrapOutcome::PortInUse(443)
        );
        let os = "SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_ERROR unsupported_os\n";
        assert!(matches!(
            parse_output(os, Some(11)).outcome,
            BootstrapOutcome::UnsupportedServer(_)
        ));
        // Marker lines survive a flood of other output.
        let flood = format!(
            "{}SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_DONE\n",
            "noise\n".repeat(50_000)
        );
        assert_eq!(
            parse_output(&flood, Some(0)).outcome,
            BootstrapOutcome::Done
        );
        // Malformed fingerprints are dropped.
        assert_eq!(
            parse_output(
                "SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_HOSTKEY_ED25519 nope\nSOMNIA_DONE\n",
                Some(0)
            )
            .host_fingerprint,
            None
        );
    }

    async fn admin(server: &TestServer, pw: &str) -> RusshTransport {
        let store = Arc::new(HostKeyStore::default());
        let host_key =
            crate::deploy::host_keys::HostKey::from_public_key(server.host_key.public_key());
        store
            .trust_new("127.0.0.1", server.addr.port(), &host_key)
            .unwrap();
        let password = Zeroizing::new(pw.to_owned());
        RusshTransport::connect(
            &SshTarget::new("127.0.0.1", server.addr.port(), "admin"),
            store,
            Credential::Password(&password),
            ConnectOptions::default(),
            [],
        )
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn sudo_password_goes_to_stdin_only_and_is_redacted() {
        let server = TestServer::start().await;
        server.set_password("login-pass");
        let sudo_canary = "sudo-canary-never-log";
        let seen = Arc::new(Mutex::new(vec![]));
        let seen2 = seen.clone();
        let fp = format!("SHA256:{}", "B".repeat(43));
        let fp_in = fp.clone();
        server.set_exec(move |cmd, stdin| {
            seen2.lock().unwrap().push(cmd.to_owned());
            if cmd.starts_with("umask 077") {
                (0, "/tmp/somnia-bootstrap.AbC12345".into(), String::new())
            } else if cmd.starts_with("sudo -S -p '' -- /bin/sh /tmp/somnia-bootstrap.AbC12345") {
                assert_eq!(stdin, format!("{sudo_canary}\n").as_bytes());
                if cmd.ends_with(" --dry-run") {
                    return (0, "SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_DRY_RUN_READY\n".into(), String::new());
                }
                // A careless script echoing the password must still be scrubbed.
                (0, format!("SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_STEP caddy\necho {sudo_canary}\nSOMNIA_HOSTKEY_ED25519 {fp_in}\nSOMNIA_DONE\n"), String::new())
            } else {
                (0, String::new(), String::new())
            }
        });
        let mut t = admin(&server, "login-pass").await;
        let steps = Mutex::new(vec![]);
        let report = run(
            &mut t,
            &params(false),
            Privilege::SudoPassword(Zeroizing::new(sudo_canary.into())),
            &|s| steps.lock().unwrap().push(s.to_owned()),
        )
        .await
        .unwrap();
        assert_eq!(report.outcome, BootstrapOutcome::Done);
        assert_eq!(report.host_fingerprint.as_deref(), Some(fp.as_str()));
        assert!(steps.lock().unwrap().iter().any(|s| s == "caddy"));
        let commands = server.state.commands.lock().unwrap().clone();
        assert!(commands
            .iter()
            .all(|c| !c.contains(sudo_canary) && !c.contains("login-pass")));
        assert!(commands
            .last()
            .unwrap()
            .starts_with("rm -f /tmp/somnia-bootstrap."));
        // The staged script is the rendered one, and it holds no secret.
        let staged = String::from_utf8(server.state.stdins.lock().unwrap()[0].clone()).unwrap();
        assert_eq!(staged, render_script(&params(false)).unwrap());
        assert!(!staged.contains(sudo_canary));
        let _ = seen;
    }

    #[tokio::test]
    async fn wrong_sudo_password_is_a_report_not_a_crash_and_cleans_up() {
        let server = TestServer::start().await;
        server.set_password("login-pass");
        server.set_exec(|cmd, _| {
            if cmd.starts_with("umask 077") {
                (0, "/tmp/somnia-bootstrap.AbC12345".into(), String::new())
            } else if cmd.starts_with("sudo ") {
                (
                    1,
                    String::new(),
                    "Sorry, try again.\nsudo: 3 incorrect password attempts\n".into(),
                )
            } else {
                (0, String::new(), String::new())
            }
        });
        let mut t = admin(&server, "login-pass").await;
        let report = run(
            &mut t,
            &params(true),
            Privilege::SudoPassword(Zeroizing::new("bad".into())),
            &|_| {},
        )
        .await
        .unwrap();
        assert_eq!(report.outcome, BootstrapOutcome::SudoDenied);
        assert!(server
            .state
            .commands
            .lock()
            .unwrap()
            .last()
            .unwrap()
            .starts_with("rm -f "));
    }

    #[tokio::test]
    async fn staging_must_return_a_private_tmp_path() {
        let server = TestServer::start().await;
        server.set_password("p");
        // A hostile or broken server answering with another path never reaches sudo.
        server.set_exec(|_, _| (0, "/etc/passwd; reboot".into(), String::new()));
        let mut t = admin(&server, "p").await;
        let err = run(&mut t, &params(false), Privilege::SudoPasswordless, &|_| {})
            .await
            .unwrap_err();
        assert_eq!(err, DeployError::Transport);
        assert!(server
            .state
            .commands
            .lock()
            .unwrap()
            .iter()
            .all(|c| !c.contains("sudo")));
    }
    #[tokio::test]
    async fn preflight_refusal_or_missing_marker_never_applies() {
        for (status, response, expected) in [
            (
                20,
                "SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_ERROR port_in_use_80\n",
                BootstrapOutcome::PortInUse(80),
            ),
            (
                0,
                "SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_DONE\n",
                BootstrapOutcome::Failed("preflight".into()),
            ),
            (
                1,
                "SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_DRY_RUN_READY\n",
                BootstrapOutcome::Failed("unknown".into()),
            ),
        ] {
            let server = TestServer::start().await;
            server.set_password("login-pass");
            server.set_exec(move |cmd, _| {
                if cmd.starts_with("umask 077") {
                    (0, "/tmp/somnia-bootstrap.AbC12345".into(), String::new())
                } else if cmd.ends_with(" --dry-run") {
                    (status, response.into(), String::new())
                } else {
                    (0, String::new(), String::new())
                }
            });
            let mut t = admin(&server, "login-pass").await;
            let report = run(&mut t, &params(false), Privilege::SudoPasswordless, &|_| {})
                .await
                .unwrap();
            assert_eq!(report.outcome, expected);
            let commands = server.state.commands.lock().unwrap();
            assert_eq!(
                commands.len(),
                3,
                "stage, preflight, cleanup only: {commands:?}"
            );
            assert!(commands[1].ends_with(" --dry-run"));
            assert!(commands[2].starts_with("rm -f "));
        }
    }

    #[tokio::test]
    async fn root_and_passwordless_sudo_apply_only_after_dry_run() {
        for privilege in [Privilege::Root, Privilege::SudoPasswordless] {
            let server = TestServer::start().await;
            server.set_password("login-pass");
            server.set_exec(|cmd, stdin| {
                if cmd.starts_with("umask 077") {
                    (0, "/tmp/somnia-bootstrap.AbC12345".into(), String::new())
                } else if cmd.ends_with(" --dry-run") {
                    assert!(stdin.is_empty());
                    (
                        0,
                        "SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_DRY_RUN_READY\n".into(),
                        String::new(),
                    )
                } else if cmd.starts_with("rm -f ") {
                    (0, String::new(), String::new())
                } else {
                    (
                        0,
                        "SOMNIA_BOOTSTRAP_STARTED\nSOMNIA_DONE\n".into(),
                        String::new(),
                    )
                }
            });
            let mut t = admin(&server, "login-pass").await;
            assert_eq!(
                run(&mut t, &params(true), privilege, &|_| {})
                    .await
                    .unwrap()
                    .outcome,
                BootstrapOutcome::Done
            );
            let commands = server.state.commands.lock().unwrap();
            assert_eq!(commands.len(), 4);
            assert_eq!(commands[1], format!("{} --dry-run", commands[2]));
        }
    }

    // Execute ONLY the read-only prefix, with all machine probes substituted by temp scripts.
    // Never execute the mutation suffix, even if the dry-run implementation regresses.
    #[cfg(unix)]
    #[test]
    fn dry_run_prefix_refuses_unrelated_caddy_and_unknown_ownership() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        for (name, body) in [
            ("id", "echo 0"),
            ("uname", "echo x86_64"),
            ("systemctl", "printf '%s\\n' \"${MANAGED_PID:-0}\""),
            ("ss", "printf '%s\\n' \"${LISTENER:-}\""),
        ] {
            let path = bin.join(name);
            std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let script = render_script(&params(false)).unwrap();
        let prefix = script.split("\nsay caddy\n").next().unwrap();
        let path = dir.path().join("check.sh");
        // Fail instead of falling through into any installation commands.
        std::fs::write(&path, format!("{prefix}\nexit 99\n")).unwrap();
        let run = |pid: &str, listener: &str| {
            std::process::Command::new("/bin/sh")
                .arg(&path)
                .arg("--dry-run")
                .env("PATH", format!("{}:/usr/bin:/bin", bin.display()))
                .env("MANAGED_PID", pid)
                .env("LISTENER", listener)
                .output()
                .unwrap()
        };
        assert!(run("0", "").status.success());
        let owned = r#"LISTEN 0 4096 *:80 *:* users:(("caddy",pid=4321,fd=7))"#;
        assert!(run("4321", owned).status.success());
        for pid in ["0", "1", "9999", "garbage"] {
            let out = run(pid, owned);
            assert_eq!(out.status.code(), Some(20));
            assert!(String::from_utf8(out.stdout)
                .unwrap()
                .contains("SOMNIA_ERROR port_in_use_80"));
        }
        let shared =
            r#"LISTEN 0 4096 *:80 *:* users:(("caddy",pid=4321,fd=7),("nginx",pid=2222,fd=8))"#;
        assert_eq!(run("4321", shared).status.code(), Some(20));
        assert_eq!(
            run("4321", "LISTEN 0 4096 *:80 *:*").status.code(),
            Some(20)
        );
        assert_eq!(
            run("4321", &format!("{owned}\nLISTEN 0 4096 *:80 *:*"))
                .status
                .code(),
            Some(20)
        );
    }
    #[tokio::test]
    async fn transport_failure_during_preflight_still_attempts_cleanup() {
        struct BrokenCheck {
            commands: Vec<String>,
        }
        impl SshExec for BrokenCheck {
            async fn exec(
                &mut self,
                command: &str,
                _: Option<&[u8]>,
            ) -> Result<crate::deploy::ssh::ExecOutput> {
                self.commands.push(command.into());
                if command.ends_with(" --dry-run") {
                    return Err(DeployError::Transport);
                }
                Ok(crate::deploy::ssh::ExecOutput {
                    status: Some(0),
                    stdout: if command.starts_with("umask 077") {
                        "/tmp/somnia-bootstrap.AbC12345".into()
                    } else {
                        String::new()
                    },
                    stderr: String::new(),
                    markers: vec![],
                    truncated: false,
                })
            }
        }
        let mut check = BrokenCheck { commands: vec![] };
        let steps = Mutex::new(vec![]);
        assert_eq!(
            run(&mut check, &params(false), Privilege::Root, &|step| steps
                .lock()
                .unwrap()
                .push(step.to_owned()))
            .await
            .unwrap_err(),
            DeployError::Transport
        );
        assert_eq!(check.commands.len(), 3);
        assert!(check.commands[2].starts_with("rm -f "));
        assert_eq!(*steps.lock().unwrap(), ["upload", "preflight"]);
    }
}
