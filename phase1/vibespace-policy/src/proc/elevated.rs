//! Elevated (arbitrary, unsandboxed) exec: a separate, explicit, user-chosen mode.
//!
//! Never a default, never silent. The mode exists only when the user's explicit setup flow
//! created an [`ElevatedSetup`] marker; the runner refuses to attach without it, the broker
//! forces every elevated shell proposal to always-ask (Deny/AllowOnce only, no run grant,
//! no autonomy coverage), and every audit line for the attachment says `process:elevated`.

use super::{ExecSpec, ProcessError, ProcessLauncher, ProcessLimits};
use crate::digest::random;
use std::path::{Path, PathBuf};

/// File created by the explicit elevated-mode setup flow.
pub const ELEVATED_MARKER: &str = ".vibespace-elevated-exec";

/// Proof that the user explicitly set up elevated exec for a space data directory.
/// Constructing one from nothing is impossible outside this module.
#[derive(Clone, Debug)]
pub struct ElevatedSetup {
    dir: PathBuf,
    token: [u8; 32],
}

impl ElevatedSetup {
    /// Establish elevated mode for `dir`: writes the marker with a fresh random token.
    /// Must only be called from the trusted settings flow after the user explicitly chose
    /// elevated exec. Overwrites any previous marker (re-confirmation).
    pub fn establish(dir: &Path) -> Result<Self, ProcessError> {
        if !dir.is_dir() {
            return Err(ProcessError::ElevatedNotSetUp);
        }
        let token = random::<32>().map_err(ProcessError::Broker)?;
        let body = format!(
            "vibespace-elevated-exec v1\n{}\n",
            crate::digest::hex(&token)
        );
        std::fs::write(dir.join(ELEVATED_MARKER), body).map_err(|e| ProcessError::Io(e.kind()))?;
        Ok(Self {
            dir: dir.to_path_buf(),
            token,
        })
    }

    /// Load and verify an existing marker. Fails closed on any mismatch.
    pub fn load(dir: &Path) -> Result<Self, ProcessError> {
        let body =
            std::fs::read_to_string(dir.join(ELEVATED_MARKER)).map_err(|_| ProcessError::ElevatedNotSetUp)?;
        let mut lines = body.lines();
        if lines.next() != Some("vibespace-elevated-exec v1") {
            return Err(ProcessError::ElevatedNotSetUp);
        }
        let hex_tok = lines.next().ok_or(ProcessError::ElevatedNotSetUp)?;
        let mut token = [0u8; 32];
        if hex_tok.len() != 64 {
            return Err(ProcessError::ElevatedNotSetUp);
        }
        for (i, b) in token.iter_mut().enumerate() {
            *b = u8::from_str_radix(&hex_tok[2 * i..2 * i + 2], 16)
                .map_err(|_| ProcessError::ElevatedNotSetUp)?;
        }
        if lines.next().is_some() {
            return Err(ProcessError::ElevatedNotSetUp);
        }
        Ok(Self {
            dir: dir.to_path_buf(),
            token,
        })
    }

    /// Remove the marker (user turned elevated mode off).
    pub fn revoke(dir: &Path) {
        let _ = std::fs::remove_file(dir.join(ELEVATED_MARKER));
    }

    /// True when the marker on disk still matches this setup.
    pub fn is_valid(&self) -> bool {
        Self::load(&self.dir).map(|s| s.token == self.token).unwrap_or(false)
    }
}

/// Direct unsandboxed launcher for elevated mode. Still captures/caps output and enforces
/// the timeout; the approval token check happened before this runs.
pub struct DirectLauncher;

impl ProcessLauncher for DirectLauncher {
    fn check(&self) -> Result<(), ProcessError> {
        Ok(())
    }

    fn run(&self, spec: &ExecSpec, limits: &ProcessLimits) -> Result<super::ExecReceipt, ProcessError> {
        let mut cmd = std::process::Command::new(&spec.program);
        cmd.args(&spec.args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        if let Some(c) = &spec.cwd {
            cmd.current_dir(c);
        }
        let mut child = cmd.spawn().map_err(|_| ProcessError::SpawnFailed)?;
        #[cfg(target_os = "linux")]
        {
            super::linux::wait_capped(&mut child, limits)
        }
        #[cfg(not(target_os = "linux"))]
        {
            wait_capped_portable(&mut child, limits)
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn wait_capped_portable(
    child: &mut std::process::Child,
    limits: &ProcessLimits,
) -> Result<super::ExecReceipt, ProcessError> {
    use std::io::Read;
    use std::time::{Duration, Instant};
    fn cap_reader(mut r: impl Read + Send + 'static, cap: usize) -> std::thread::JoinHandle<(Vec<u8>, bool)> {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let mut chunk = [0u8; 8192];
            let mut truncated = false;
            loop {
                match r.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        let room = cap.saturating_sub(buf.len());
                        let take = room.min(n);
                        buf.extend_from_slice(&chunk[..take]);
                        if take < n {
                            truncated = true;
                        }
                    }
                    Err(_) => break,
                }
            }
            (buf, truncated)
        })
    }
    let stdout = child.stdout.take().ok_or(ProcessError::SpawnFailed)?;
    let stderr = child.stderr.take().ok_or(ProcessError::SpawnFailed)?;
    let h_out = cap_reader(stdout, limits.max_output_bytes);
    let h_err = cap_reader(stderr, limits.max_output_bytes);
    let deadline = Instant::now() + limits.timeout.min(Duration::from_secs(3600));
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = h_out.join();
                    let _ = h_err.join();
                    return Err(ProcessError::Timeout);
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(_) => return Err(ProcessError::SpawnFailed),
        }
    };
    let (out, out_t) = h_out.join().map_err(|_| ProcessError::SpawnFailed)?;
    let (err, err_t) = h_err.join().map_err(|_| ProcessError::SpawnFailed)?;
    Ok(super::ExecReceipt {
        exit_code: status.code(),
        stdout: String::from_utf8_lossy(&out).into_owned(),
        stderr: String::from_utf8_lossy(&err).into_owned(),
        truncated: out_t || err_t,
    })
}
