//! Shared cold-argv and second-instance parser. No logging, file reads or renderer paths.
//! Rejects are reported exactly once by the queue, not by this module.
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use super::{
    identity::{identity_of, FileIdentity},
    policy::IntakePolicy,
};
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

pub const MAX_FILES_PER_REQUEST: usize = 64;
pub const MAX_ARGV_BYTES: usize = 32 * 1024;
pub const MAX_PATH_BYTES: usize = 4 * 1024;
const VALUE_FLAGS: &[&str] = &["--config", "--profile", "--log-level"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RejectReason {
    Url,
    DeviceNamespace,
    UncBlocked,
    Directory,
    NotFound,
    PathTooLong,
    ArgvTooLong,
    TooManyFiles,
    InvalidUnicode,
}
impl RejectReason {
    pub fn cause_code(&self) -> &'static str {
        match self {
            Self::Url => "url",
            Self::DeviceNamespace => "device",
            Self::UncBlocked => "unc-blocked",
            Self::Directory => "directory",
            Self::NotFound => "not-found",
            Self::PathTooLong => "path-too-long",
            Self::ArgvTooLong => "length",
            Self::TooManyFiles => "files",
            Self::InvalidUnicode => "invalid-unicode",
        }
    }
    pub fn expected(&self) -> bool {
        matches!(
            self,
            Self::Url | Self::DeviceNamespace | Self::UncBlocked | Self::Directory
        )
    }
}

#[derive(Clone, Debug)]
pub struct ParsedItem {
    pub ordinal: u32,
    pub canonical: PathBuf,
    /// UI only. Never include in diagnostic events.
    pub display_name: String,
    pub ext: String,
    pub identity: FileIdentity,
    pub size: u64,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RejectedItem {
    pub ordinal: u32,
    pub reason: RejectReason,
    /// Bounded ASCII file extension only, never an arbitrary argv substring.
    pub ext: Option<String>,
}
#[derive(Clone, Debug, Default)]
pub struct ParsedRequest {
    pub items: Vec<ParsedItem>,
    pub rejected: Vec<RejectedItem>,
}

pub fn parse_open_args<I: IntoIterator<Item = OsString>>(
    args: I,
    sender_cwd: &Path,
    policy: &IntakePolicy,
) -> ParsedRequest {
    parse_with(args, sender_cwd, policy, &|path| {
        let canonical = fs::canonicalize(path).map_err(|_| RejectReason::NotFound)?;
        let metadata = fs::metadata(&canonical).map_err(|_| RejectReason::NotFound)?;
        if !metadata.is_file() {
            return Err(RejectReason::Directory);
        }
        let identity = identity_of(&canonical, &metadata).map_err(|_| RejectReason::NotFound)?;
        Ok((canonical, metadata.len(), identity))
    })
}

// Injection is private and only tests the before-filesystem policy boundary.
// Accepted-path tests below call the public production parser against real files.
fn parse_with<I: IntoIterator<Item = OsString>>(
    args: I,
    sender_cwd: &Path,
    policy: &IntakePolicy,
    inspect: &impl Fn(&Path) -> Result<(PathBuf, u64, FileIdentity), RejectReason>,
) -> ParsedRequest {
    let mut result = ParsedRequest::default();
    let mut args = args.into_iter();
    let mut total_bytes = args.next().map_or(0, |exe| exe.as_encoded_bytes().len());
    let mut flags = true;
    let mut consume_value = false;
    let mut ordinal = 0_u32;
    let mut candidates = 0_usize;
    for arg in args {
        total_bytes = total_bytes.saturating_add(arg.as_encoded_bytes().len());
        let text = arg.to_string_lossy();
        if consume_value {
            consume_value = false;
            continue;
        }
        if flags && text == "--" {
            flags = false;
            continue;
        }
        if flags && text.starts_with('-') {
            // Unknown switches, including plugin pipe artifacts, are never paths.
            consume_value = VALUE_FLAGS.contains(&text.as_ref());
            continue;
        }
        if text.is_empty() {
            continue;
        }
        let current = ordinal;
        ordinal = ordinal.saturating_add(1);
        candidates = candidates.saturating_add(1);
        let ext = safe_extension(&text);
        let reason = if total_bytes > MAX_ARGV_BYTES {
            Some(RejectReason::ArgvTooLong)
        } else if candidates > MAX_FILES_PER_REQUEST {
            Some(RejectReason::TooManyFiles)
        } else if arg.as_encoded_bytes().len() > MAX_PATH_BYTES {
            Some(RejectReason::PathTooLong)
        } else if is_url(&text) {
            Some(RejectReason::Url)
        } else if is_device(&text) {
            Some(RejectReason::DeviceNamespace)
        } else if is_unc(&text) && !policy.allow_unc {
            Some(RejectReason::UncBlocked)
        }
        // Lossy conversion must not accidentally open another existing file.
        else if arg.to_str().is_none() {
            Some(RejectReason::NotFound)
        } else {
            None
        };
        if let Some(reason) = reason {
            result.rejected.push(RejectedItem {
                ordinal: current,
                reason,
                ext,
            });
            continue;
        }
        let path = Path::new(text.as_ref());
        let resolved = if path.is_absolute() {
            path.to_owned()
        } else {
            sender_cwd.join(path)
        };
        // A relative argv value can inherit a network/device namespace from cwd.
        // Apply the same policy to the resolved path before any filesystem call.
        let resolved_text = resolved.to_string_lossy();
        let resolved_reject = if is_device(&resolved_text) {
            Some(RejectReason::DeviceNamespace)
        } else if is_unc(&resolved_text) && !policy.allow_unc {
            Some(RejectReason::UncBlocked)
        } else if resolved.as_os_str().as_encoded_bytes().len() > MAX_PATH_BYTES {
            Some(RejectReason::PathTooLong)
        } else {
            None
        };
        if let Some(reason) = resolved_reject {
            result.rejected.push(RejectedItem {
                ordinal: current,
                reason,
                ext,
            });
            continue;
        }
        match inspect(&resolved) {
            Ok((canonical, size, identity)) => {
                let display_name = canonical
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let ext = safe_extension(&canonical.to_string_lossy()).unwrap_or_default();
                result.items.push(ParsedItem {
                    ordinal: current,
                    canonical,
                    display_name,
                    ext,
                    identity,
                    size,
                });
            }
            Err(reason) => result.rejected.push(RejectedItem {
                ordinal: current,
                reason,
                ext,
            }),
        }
    }
    result
}

fn is_url(text: &str) -> bool {
    let Some((scheme, _)) = text.split_once("://") else {
        return false;
    };
    let mut chars = scheme.bytes();
    chars.next().is_some_and(|b| b.is_ascii_alphabetic())
        && chars.all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'.' | b'-'))
}
fn is_device(text: &str) -> bool {
    let normalized = text.replace('/', "\\");
    normalized.starts_with("\\\\?\\") || normalized.starts_with("\\\\.\\")
}
fn is_unc(text: &str) -> bool {
    text.starts_with("\\\\") || text.starts_with("//")
}
fn safe_extension(text: &str) -> Option<String> {
    let basename = text.rsplit(['/', '\\']).next()?;
    let (_, ext) = basename.rsplit_once('.')?;
    if ext.is_empty() || ext.len() > 16 || !ext.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return None;
    }
    Some(ext.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, error::Error};
    type TestResult = Result<(), Box<dyn Error>>;
    fn argv(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }
    fn parse(values: &[&str], cwd: &Path) -> ParsedRequest {
        parse_open_args(argv(values), cwd, &IntakePolicy { allow_unc: false })
    }
    fn fixture() -> Result<tempfile::TempDir, Box<dyn Error>> {
        let dir = tempfile::tempdir()?;
        for (name, contents) in [
            ("a.HTML", "one"),
            ("b.svg", "two"),
            ("with spaces.txt", "spaces"),
            ("über 🎨.svg", "unicode"),
            ("-dash.txt", "dash"),
            ("--profile", "flag filename"),
        ] {
            fs::write(dir.path().join(name), contents)?;
        }
        Ok(dir)
    }
    fn reject(values: &[&str], expected: RejectReason) {
        let got = parse(values, Path::new("."));
        assert!(got.items.is_empty());
        assert_eq!(got.rejected.len(), 1);
        assert_eq!(got.rejected.first().map(|r| r.reason), Some(expected));
    }
    #[test]
    fn empty_argv_is_activation_only() {
        assert!(parse(&[], Path::new(".")).items.is_empty());
    }
    #[test]
    fn executable_is_skipped_exactly_once() -> TestResult {
        let dir = fixture()?;
        let got = parse(&["a.HTML", "b.svg"], dir.path());
        assert_eq!(got.items.len(), 1);
        assert_eq!(
            got.items.first().map(|i| i.display_name.as_str()),
            Some("b.svg")
        );
        Ok(())
    }
    #[test]
    fn no_file_arguments_is_activation_only() {
        let got = parse(
            &[
                "somnia",
                "--verbose",
                "--no-default-plugins",
                "--help",
                "-h",
                "--version",
                "-V",
            ],
            Path::new("."),
        );
        assert!(got.items.is_empty() && got.rejected.is_empty());
    }
    #[test]
    fn captures_all_real_files_in_order() -> TestResult {
        let dir = fixture()?;
        let got = parse(
            &["somnia", "--no-default-plugins", "a.HTML", "b.svg"],
            dir.path(),
        );
        assert_eq!(
            got.items.iter().map(|i| i.ordinal).collect::<Vec<_>>(),
            vec![0, 1]
        );
        assert_eq!(
            got.items
                .iter()
                .map(|i| i.display_name.as_str())
                .collect::<Vec<_>>(),
            vec!["a.HTML", "b.svg"]
        );
        Ok(())
    }
    #[test]
    fn nonexistent_path_is_rejected_not_silently_lost() {
        reject(&["somnia", "absent-s5.svg"], RejectReason::NotFound);
    }
    #[test]
    fn empty_argument_is_ignored() -> TestResult {
        let dir = fixture()?;
        let got = parse(&["somnia", "", "a.HTML"], dir.path());
        assert_eq!(got.items.len(), 1);
        assert!(got.rejected.is_empty());
        Ok(())
    }
    #[test]
    fn terminator_allows_dash_filename() -> TestResult {
        let dir = fixture()?;
        let got = parse(&["somnia", "--", "-dash.txt", "--profile"], dir.path());
        assert_eq!(got.items.len(), 2);
        Ok(())
    }
    #[test]
    fn value_flags_consume_values_not_files() -> TestResult {
        let dir = fixture()?;
        let got = parse(
            &[
                "somnia",
                "--config",
                "a.HTML",
                "--profile",
                "b.svg",
                "--log-level",
                "debug",
                "with spaces.txt",
            ],
            dir.path(),
        );
        assert_eq!(got.items.len(), 1);
        assert!(got.rejected.is_empty());
        Ok(())
    }
    #[test]
    fn equals_value_flags_are_not_paths() -> TestResult {
        let dir = fixture()?;
        let got = parse(
            &[
                "somnia",
                "--config=a.HTML",
                "--profile=b.svg",
                "--log-level=debug",
                "a.HTML",
            ],
            dir.path(),
        );
        assert_eq!(got.items.len(), 1);
        assert!(got.rejected.is_empty());
        Ok(())
    }
    #[test]
    fn dangling_value_flag_does_not_panic() {
        let got = parse(&["somnia", "--config"], Path::new("."));
        assert!(got.items.is_empty() && got.rejected.is_empty());
    }
    #[test]
    fn unknown_flags_and_pipe_artifacts_are_not_files() -> TestResult {
        let dir = fixture()?;
        let got = parse(
            &["somnia", "--bogus|artifact", "--unknown=value", "a.HTML"],
            dir.path(),
        );
        assert_eq!(got.items.len(), 1);
        assert!(got.rejected.is_empty());
        Ok(())
    }
    #[test]
    fn unknown_flag_does_not_swallow_next_file() -> TestResult {
        let dir = fixture()?;
        assert_eq!(
            parse(&["somnia", "--bogus", "b.svg"], dir.path())
                .items
                .len(),
            1
        );
        Ok(())
    }
    #[test]
    fn relative_path_uses_sender_cwd() -> TestResult {
        let dir = fixture()?;
        let got = parse(&["somnia", "a.HTML"], dir.path());
        assert_eq!(
            got.items.first().map(|i| &i.canonical),
            Some(&fs::canonicalize(dir.path().join("a.HTML"))?)
        );
        Ok(())
    }
    #[test]
    fn absolute_path_does_not_use_receiver_cwd() -> TestResult {
        let dir = fixture()?;
        let path = dir.path().join("b.svg");
        let got = parse_open_args(
            [OsString::from("somnia"), path.into_os_string()],
            Path::new("/nonexistent-cwd"),
            &IntakePolicy { allow_unc: false },
        );
        assert_eq!(got.items.len(), 1);
        Ok(())
    }
    #[test]
    fn spaces_and_unicode_survive() -> TestResult {
        let dir = fixture()?;
        let got = parse(&["somnia", "with spaces.txt", "über 🎨.svg"], dir.path());
        assert_eq!(
            got.items
                .iter()
                .map(|i| i.display_name.as_str())
                .collect::<Vec<_>>(),
            vec!["with spaces.txt", "über 🎨.svg"]
        );
        Ok(())
    }
    #[test]
    fn extension_is_lowercase_and_size_is_real() -> TestResult {
        let dir = fixture()?;
        let got = parse(&["somnia", "a.HTML"], dir.path());
        assert_eq!(
            got.items.first().map(|i| (i.ext.as_str(), i.size)),
            Some(("html", 3))
        );
        Ok(())
    }
    #[test]
    fn oversized_path_rejected_before_filesystem() {
        let arg = "a".repeat(MAX_PATH_BYTES + 1);
        reject(&["somnia", &arg], RejectReason::PathTooLong);
    }
    #[test]
    fn argv_over_budget_rejects_remaining_files() -> TestResult {
        let dir = fixture()?;
        let flag = format!("--unknown={}", "x".repeat(MAX_ARGV_BYTES));
        let got = parse(&["somnia", "a.HTML", &flag, "b.svg", "a.HTML"], dir.path());
        assert_eq!(got.items.len(), 1);
        assert_eq!(got.rejected.len(), 2);
        assert!(got
            .rejected
            .iter()
            .all(|r| r.reason == RejectReason::ArgvTooLong));
        Ok(())
    }
    #[test]
    fn exactly_64_files_are_accepted() -> TestResult {
        let dir = fixture()?;
        let mut values = vec!["somnia"];
        values.extend(std::iter::repeat_n("a.HTML", 64));
        let got = parse(&values, dir.path());
        assert_eq!(got.items.len(), 64);
        assert!(got.rejected.is_empty());
        Ok(())
    }
    #[test]
    fn file_65_rejected_and_first_64_preserved() -> TestResult {
        let dir = fixture()?;
        let mut values = vec!["somnia"];
        values.extend(std::iter::repeat_n("a.HTML", 65));
        let got = parse(&values, dir.path());
        assert_eq!(got.items.len(), 64);
        assert_eq!(
            got.rejected,
            vec![RejectedItem {
                ordinal: 64,
                reason: RejectReason::TooManyFiles,
                ext: Some("html".into())
            }]
        );
        Ok(())
    }
    #[test]
    fn http_url_is_rejected() {
        reject(
            &["somnia", "http://example.invalid/a.svg"],
            RejectReason::Url,
        );
    }
    #[test]
    fn file_url_is_rejected() {
        reject(&["somnia", "file:///tmp/a.svg"], RejectReason::Url);
    }
    #[test]
    fn custom_and_uppercase_schemes_are_rejected() {
        for url in ["HTTP://example.invalid/a", "somnia+v1://a", "a.b-c://a"] {
            reject(&["somnia", url], RejectReason::Url);
        }
    }
    #[test]
    fn windows_drive_is_not_a_url() {
        assert!(!is_url("C:\\docs\\a.svg"));
    }
    #[test]
    fn device_namespaces_rejected_even_with_unc_enabled() {
        for path in [
            "\\\\?\\C:\\a.svg",
            "\\\\.\\PhysicalDrive0",
            "//?/UNC/server/share/a.svg",
        ] {
            let got = parse_open_args(
                argv(&["somnia", path]),
                Path::new("."),
                &IntakePolicy { allow_unc: true },
            );
            assert_eq!(
                got.rejected.first().map(|r| r.reason),
                Some(RejectReason::DeviceNamespace)
            );
        }
    }
    #[test]
    fn blocked_shapes_never_touch_filesystem() {
        let count = Cell::new(0);
        for path in [
            "\\\\server\\share\\a.svg",
            "//server/share/a.svg",
            "file:///a.svg",
            "\\\\?\\C:\\a.svg",
            "\\\\.\\x",
        ] {
            let got = parse_with(
                argv(&["somnia", path]),
                Path::new("."),
                &IntakePolicy { allow_unc: false },
                &|_| {
                    count.set(count.get() + 1);
                    Err(RejectReason::NotFound)
                },
            );
            assert_eq!(got.rejected.len(), 1);
        }
        assert_eq!(count.get(), 0);
    }
    #[test]
    fn enabled_unc_reaches_filesystem_validation() {
        let count = Cell::new(0);
        let got = parse_with(
            argv(&["somnia", "\\\\server\\share\\a.svg"]),
            Path::new("."),
            &IntakePolicy { allow_unc: true },
            &|_| {
                count.set(count.get() + 1);
                Err(RejectReason::NotFound)
            },
        );
        assert_eq!(count.get(), 1);
        assert_eq!(
            got.rejected.first().map(|r| r.reason),
            Some(RejectReason::NotFound)
        );
    }
    #[test]
    fn directory_is_expected_policy_rejection() -> TestResult {
        let dir = fixture()?;
        let got = parse(&["somnia", "."], dir.path());
        assert_eq!(
            got.rejected
                .first()
                .map(|r| (r.reason, r.reason.expected())),
            Some((RejectReason::Directory, true))
        );
        Ok(())
    }
    #[test]
    fn only_policy_reasons_are_expected() {
        for reason in [
            RejectReason::Url,
            RejectReason::DeviceNamespace,
            RejectReason::UncBlocked,
            RejectReason::Directory,
        ] {
            assert!(reason.expected());
        }
        for reason in [
            RejectReason::NotFound,
            RejectReason::PathTooLong,
            RejectReason::ArgvTooLong,
            RejectReason::TooManyFiles,
            RejectReason::InvalidUnicode,
        ] {
            assert!(!reason.expected());
        }
    }
    #[test]
    fn reject_diagnostics_never_include_arbitrary_extensions() {
        assert_eq!(safe_extension("/private/person.sensitive-secret"), None);
        assert_eq!(safe_extension("/private/person.svg"), Some("svg".into()));
        assert_eq!(RejectReason::UncBlocked.cause_code(), "unc-blocked");
    }
    #[test]
    fn identity_is_stable_for_same_file_and_distinct_within_folder() -> TestResult {
        let dir = fixture()?;
        let got = parse(&["somnia", "a.HTML", "./a.HTML", "b.svg"], dir.path());
        let ids: Vec<_> = got.items.iter().map(|i| i.identity.token()).collect();
        assert_eq!(ids.len(), 3);
        assert_eq!(ids.first(), ids.get(1));
        assert_ne!(ids.first(), ids.get(2));
        Ok(())
    }
    #[test]
    fn rejected_item_ordinals_do_not_collapse_accepted_items() -> TestResult {
        let dir = fixture()?;
        let got = parse(
            &["somnia", "missing.svg", "a.HTML", ".", "b.svg"],
            dir.path(),
        );
        assert_eq!(
            got.items.iter().map(|i| i.ordinal).collect::<Vec<_>>(),
            vec![1, 3]
        );
        assert_eq!(
            got.rejected.iter().map(|i| i.ordinal).collect::<Vec<_>>(),
            vec![0, 2]
        );
        Ok(())
    }
    #[cfg(unix)]
    #[test]
    fn invalid_unicode_never_opens_lossy_lookalike() -> TestResult {
        use std::os::unix::ffi::OsStringExt;
        let dir = fixture()?;
        fs::write(dir.path().join("bad�.svg"), "lookalike")?;
        let got = parse_open_args(
            [
                OsString::from("somnia"),
                OsString::from_vec(b"bad\xff.svg".to_vec()),
            ],
            dir.path(),
            &IntakePolicy { allow_unc: false },
        );
        assert!(got.items.is_empty());
        assert_eq!(
            got.rejected.first().map(|r| r.reason),
            Some(RejectReason::NotFound)
        );
        Ok(())
    }
    #[cfg(unix)]
    #[test]
    fn canonical_symlink_has_same_identity() -> TestResult {
        let dir = fixture()?;
        std::os::unix::fs::symlink(dir.path().join("a.HTML"), dir.path().join("alias.html"))?;
        let got = parse(&["somnia", "a.HTML", "alias.html"], dir.path());
        assert_eq!(got.items.len(), 2);
        assert_eq!(
            got.items.first().map(|i| &i.identity),
            got.items.get(1).map(|i| &i.identity)
        );
        Ok(())
    }
}

#[cfg(test)]
mod limit_boundary_tests {
    use super::*;
    use std::{cell::Cell, error::Error};
    #[test]
    fn path_limit_is_inclusive_and_rejects_before_stat() {
        let calls = Cell::new(0);
        for (length, reason) in [
            (MAX_PATH_BYTES, RejectReason::NotFound),
            (MAX_PATH_BYTES + 1, RejectReason::PathTooLong),
        ] {
            let prefix = if cfg!(windows) { "C:\\" } else { "/" };
            let path = format!("{prefix}{}", "x".repeat(length - prefix.len()));
            let got = parse_with(
                [OsString::from("somnia"), OsString::from(path)],
                Path::new("."),
                &IntakePolicy { allow_unc: false },
                &|_| {
                    calls.set(calls.get() + 1);
                    Err(RejectReason::NotFound)
                },
            );
            assert_eq!(got.rejected.first().map(|r| r.reason), Some(reason));
        }
        assert_eq!(calls.get(), 1);
    }
    #[test]
    fn total_argv_limit_is_inclusive() -> Result<(), Box<dyn Error>> {
        let dir = tempfile::tempdir()?;
        fs::write(dir.path().join("a.svg"), "real bytes")?;
        let padding = format!(
            "--{}",
            "x".repeat(MAX_ARGV_BYTES - "somnia".len() - "a.svg".len() - 2)
        );
        let at_limit = parse_open_args(
            ["somnia", &padding, "a.svg"].map(OsString::from),
            dir.path(),
            &IntakePolicy { allow_unc: false },
        );
        assert_eq!(at_limit.items.len(), 1);
        let over = format!("{padding}x");
        let over_limit = parse_open_args(
            ["somnia", &over, "a.svg"].map(OsString::from),
            dir.path(),
            &IntakePolicy { allow_unc: false },
        );
        assert_eq!(
            over_limit.rejected.first().map(|r| r.reason),
            Some(RejectReason::ArgvTooLong)
        );
        Ok(())
    }
    #[test]
    fn limits_remain_effective_after_flag_terminator() {
        let calls = Cell::new(0);
        let huge = OsString::from(format!("--{}", "x".repeat(MAX_PATH_BYTES)));
        let got = parse_with(
            [OsString::from("somnia"), OsString::from("--"), huge],
            Path::new("."),
            &IntakePolicy { allow_unc: false },
            &|_| {
                calls.set(calls.get() + 1);
                Err(RejectReason::NotFound)
            },
        );
        assert_eq!(calls.get(), 0);
        assert_eq!(
            got.rejected.first().map(|r| r.reason),
            Some(RejectReason::PathTooLong)
        );
    }
}

#[cfg(test)]
mod cwd_policy_tests {
    use super::*;
    use std::cell::Cell;
    #[test]
    fn relative_path_cannot_bypass_unc_policy_via_sender_cwd() {
        let count = Cell::new(0);
        let got = parse_with(
            ["somnia", "a.svg"].map(OsString::from),
            Path::new("//server/share"),
            &IntakePolicy { allow_unc: false },
            &|_| {
                count.set(count.get() + 1);
                Err(RejectReason::NotFound)
            },
        );
        assert_eq!(count.get(), 0);
        assert_eq!(
            got.rejected.first().map(|r| r.reason),
            Some(RejectReason::UncBlocked)
        );
    }
    #[test]
    fn resolved_path_budget_is_checked_before_filesystem() {
        let count = Cell::new(0);
        let cwd = PathBuf::from(format!("/{}", "x".repeat(MAX_PATH_BYTES)));
        let got = parse_with(
            ["somnia", "a.svg"].map(OsString::from),
            &cwd,
            &IntakePolicy { allow_unc: false },
            &|_| {
                count.set(count.get() + 1);
                Err(RejectReason::NotFound)
            },
        );
        assert_eq!(count.get(), 0);
        assert_eq!(
            got.rejected.first().map(|r| r.reason),
            Some(RejectReason::PathTooLong)
        );
    }
}
