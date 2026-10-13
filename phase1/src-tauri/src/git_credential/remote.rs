//! Remote URL validation. Runs BEFORE any token is provided: the effective fetch/push URL (after
//! `pushurl`, `insteadOf` and `pushInsteadOf`) must be one plain `https://github.com/owner/repo[.git]`.
use super::{BridgeError, Policy};
use std::path::Path;
use std::process::{Command, Stdio};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Operation {
    Clone,
    Fetch,
    Push,
}

/// Canonical repository identity. `key()` is what the helper request is matched against.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoRef {
    pub owner: String,
    pub repo: String,
}
impl RepoRef {
    pub fn key(&self) -> String {
        format!("{}/{}", self.owner, self.repo).to_ascii_lowercase()
    }
    pub fn display(&self) -> String {
        format!("{}/{}", self.owner, self.repo)
    }
}

/// An effective remote that passed policy. `url` has no userinfo and may be passed to git in argv.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ValidatedRemote {
    pub url: String,
    pub repo: RepoRef,
    pub operation: Operation,
}

fn name_ok(s: &str, max: usize, extra: &[char]) -> bool {
    !s.is_empty() && s.len() <= max && s.chars().all(|c| c.is_ascii_alphanumeric() || extra.contains(&c))
}

/// Strict parse of one URL against the policy. Rejects anything that is not exactly
/// `scheme://host/owner/repo[.git]`: userinfo, port (unless policy), query, fragment, percent-encoding,
/// backslashes, whitespace/control, extra path segments, trailing slash.
pub fn parse_url(raw: &str, policy: &Policy) -> Result<RepoRef, BridgeError> {
    let lower = raw.to_ascii_lowercase();
    if lower.starts_with("ssh://") || lower.starts_with("git@") || lower.starts_with("git://") || lower.contains("::") || (!lower.contains("://") && raw.contains(':') && raw.contains('@')) {
        return Err(BridgeError::UnsupportedScheme);
    }
    if raw.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\') || raw.len() > 512 {
        return Err(BridgeError::InvalidRemoteUrl);
    }
    let Some((scheme, rest)) = raw.split_once("://") else { return Err(BridgeError::UnsupportedScheme) };
    if !scheme.eq_ignore_ascii_case(policy.scheme) {
        return Err(BridgeError::UnsupportedScheme);
    }
    let (authority, path) = rest.split_once('/').ok_or(BridgeError::InvalidRemoteUrl)?;
    if authority.contains('@') {
        return Err(BridgeError::UrlHasCredentials);
    }
    if !authority.eq_ignore_ascii_case(&policy.host_header()) {
        return Err(BridgeError::UnsupportedHost);
    }
    if path.contains(['?', '#', '%']) {
        return Err(BridgeError::InvalidRemoteUrl);
    }
    let mut segs = path.split('/');
    let (Some(owner), Some(repo), None) = (segs.next(), segs.next(), segs.next()) else { return Err(BridgeError::InvalidRemoteUrl) };
    let repo = repo.strip_suffix(".git").unwrap_or(repo);
    if !name_ok(owner, 39, &['-']) || owner.starts_with('-') || !name_ok(repo, 100, &['-', '_', '.']) || repo == "." || repo == ".." {
        return Err(BridgeError::InvalidRemoteUrl);
    }
    Ok(RepoRef { owner: owner.to_owned(), repo: repo.to_owned() })
}

fn git_lines(cwd: &Path, args: &[&str]) -> Result<(Option<i32>, Vec<String>), BridgeError> {
    let mut cmd = Command::new("git");
    cmd.env_clear();
    for k in ["PATH", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "SystemRoot", "TEMP", "TMP", "TMPDIR", "XDG_CONFIG_HOME"] {
        if let Some(v) = std::env::var_os(k) {
            cmd.env(k, v);
        }
    }
    let out = cmd
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .current_dir(cwd)
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|_| BridgeError::GitFailed)?;
    let lines = String::from_utf8_lossy(&out.stdout).lines().map(str::to_owned).filter(|l| !l.is_empty()).collect();
    Ok((out.status.code(), lines))
}

fn remote_name_ok(n: &str) -> bool {
    name_ok(n, 64, &['-', '_', '.']) && !n.starts_with('-') && !n.starts_with('.')
}

/// Validates the remote `name` of the repo at `repo_dir` for `op` (Fetch or Push) and returns the
/// canonical URL to pass to git. Rejects multiple URLs and any active rewrite: the effective URL must
/// equal the configured one, so what is validated here is exactly where git will connect.
pub fn validate_remote(repo_dir: &Path, name: &str, op: Operation, policy: &Policy) -> Result<ValidatedRemote, BridgeError> {
    if !remote_name_ok(name) || op == Operation::Clone {
        return Err(BridgeError::InvalidArgs);
    }
    let (code, urls) = git_lines(repo_dir, &["config", "--get-all", &format!("remote.{name}.url")])?;
    if code != Some(0) || urls.is_empty() {
        return Err(BridgeError::NoSuchRemote);
    }
    let (_, push_urls) = git_lines(repo_dir, &["config", "--get-all", &format!("remote.{name}.pushurl")])?;
    if urls.len() > 1 || push_urls.len() > 1 {
        return Err(BridgeError::MultipleUrls);
    }
    let (raw, effective) = match op {
        Operation::Fetch => {
            let (c, eff) = git_lines(repo_dir, &["remote", "get-url", name])?;
            (urls[0].clone(), (c, eff))
        }
        _ => {
            let (c, eff) = git_lines(repo_dir, &["remote", "get-url", "--push", name])?;
            (push_urls.first().unwrap_or(&urls[0]).clone(), (c, eff))
        }
    };
    if effective.0 != Some(0) || effective.1.len() != 1 {
        return Err(if effective.1.len() > 1 { BridgeError::MultipleUrls } else { BridgeError::GitFailed });
    }
    // Policy on the effective URL first so the specific reason (ssh, host, userinfo) wins.
    let repo = parse_url(&effective.1[0], policy)?;
    if effective.1[0] != raw {
        return Err(BridgeError::RewriteDetected);
    }
    Ok(ValidatedRemote { url: effective.1[0].clone(), repo, operation: op })
}

/// Validates an explicit URL for clone/ls-remote. A global `insteadOf` would silently change where
/// git connects, so the URL git resolves must equal the one given.
pub fn validate_clone_url(url: &str, policy: &Policy) -> Result<ValidatedRemote, BridgeError> {
    let repo = parse_url(url, policy)?;
    let cwd = std::env::temp_dir();
    let (code, lines) = git_lines(&cwd, &["ls-remote", "--get-url", url])?;
    if code != Some(0) || lines.len() != 1 {
        return Err(BridgeError::GitFailed);
    }
    if lines[0] != url {
        return Err(BridgeError::RewriteDetected);
    }
    Ok(ValidatedRemote { url: url.to_owned(), repo, operation: Operation::Clone })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn gh(u: &str) -> Result<RepoRef, BridgeError> {
        parse_url(u, &Policy::github())
    }
    #[test]
    fn accepts_plain_github_https() {
        let r = gh("https://github.com/philppplik/somnia.git").unwrap();
        assert_eq!((r.owner.as_str(), r.repo.as_str(), r.key().as_str()), ("philppplik", "somnia", "philppplik/somnia"));
        assert_eq!(gh("https://GitHub.com/Foo/bar").unwrap().key(), "foo/bar");
        assert_eq!(gh("https://github.com/a/b.c_d-e").unwrap().repo, "b.c_d-e");
    }
    #[test]
    fn rejects_everything_else() {
        let cases: &[(&str, BridgeError)] = &[
            ("git@github.com:o/r.git", BridgeError::UnsupportedScheme),
            ("ssh://git@github.com/o/r.git", BridgeError::UnsupportedScheme),
            ("git://github.com/o/r.git", BridgeError::UnsupportedScheme),
            ("http://github.com/o/r.git", BridgeError::UnsupportedScheme),
            ("file:///tmp/x", BridgeError::UnsupportedScheme),
            ("ext::sh -c evil", BridgeError::UnsupportedScheme),
            ("/local/path", BridgeError::UnsupportedScheme),
            ("https://user:pw@github.com/o/r.git", BridgeError::UrlHasCredentials),
            ("https://tok@github.com/o/r.git", BridgeError::UrlHasCredentials),
            ("https://github.com.evil.example/o/r.git", BridgeError::UnsupportedHost),
            ("https://evil.example/github.com/o/r.git", BridgeError::UnsupportedHost),
            ("https://github.com:444/o/r.git", BridgeError::UnsupportedHost),
            ("https://github.com:443/o/r.git", BridgeError::UnsupportedHost),
            ("https://gist.github.com/o/r.git", BridgeError::UnsupportedHost),
            ("https://github.com/o", BridgeError::InvalidRemoteUrl),
            ("https://github.com/o/r/extra", BridgeError::InvalidRemoteUrl),
            ("https://github.com/o/r/", BridgeError::InvalidRemoteUrl),
            ("https://github.com/o/r.git?x=1", BridgeError::InvalidRemoteUrl),
            ("https://github.com/o/r#frag", BridgeError::InvalidRemoteUrl),
            ("https://github.com/o/%72", BridgeError::InvalidRemoteUrl),
            ("https://github.com/o/..", BridgeError::InvalidRemoteUrl),
            ("https://github.com/-o/r", BridgeError::InvalidRemoteUrl),
            ("https://github.com/o/r r", BridgeError::InvalidRemoteUrl),
            ("https://github.com\\@evil.example/o/r", BridgeError::InvalidRemoteUrl),
            ("https://github.com/o/r\n", BridgeError::InvalidRemoteUrl),
            ("https://github.com//r", BridgeError::InvalidRemoteUrl),
        ];
        for (u, e) in cases {
            assert_eq!(gh(u), Err(*e), "{u}");
        }
    }
}
