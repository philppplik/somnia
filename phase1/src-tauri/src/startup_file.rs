//! File-association launch: the OS passes the opened file as an argv entry (Windows "Open with",
//! macOS open-events arrive separately). Only a real existing file that is not a flag is accepted;
//! the renderer never supplies the path, it pulls the stored one through `open_startup_file`.
use std::ffi::OsString;
use std::path::PathBuf;

/// First argv entry (after the executable name) that is not a flag and names an existing file.
pub fn capture(
    args: impl IntoIterator<Item = OsString>,
    is_file: impl Fn(&std::path::Path) -> bool,
) -> Option<PathBuf> {
    args.into_iter().skip(1).find(|arg| {
        let text = arg.to_string_lossy();
        !text.starts_with('-') && !text.is_empty() && is_file(std::path::Path::new(arg.as_os_str()))
    }).map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn picks_the_first_real_file_and_skips_flags() {
        let files: HashSet<&str> = ["C:\\docs\\site.html"].into_iter().collect();
        let args: Vec<OsString> = ["somnia.exe", "--no-default-plugins", "C:\\docs\\site.html"]
            .into_iter().map(OsString::from).collect();
        let got = capture(args, |p| files.contains(p.to_string_lossy().as_ref()));
        assert_eq!(got, Some(PathBuf::from("C:\\docs\\site.html")));
    }

    #[test]
    fn no_file_argument_means_no_startup_open() {
        let args: Vec<OsString> = ["somnia.exe", "--verbose"].into_iter().map(OsString::from).collect();
        assert_eq!(capture(args, |_| false), None);
    }

    #[test]
    fn nonexistent_paths_are_ignored() {
        let args: Vec<OsString> = ["somnia", "gone.html"].into_iter().map(OsString::from).collect();
        assert_eq!(capture(args, |_| false), None);
    }
}
