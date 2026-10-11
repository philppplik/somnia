//! Sanitising of untrusted text before it reaches the consent UI or the audit log.

const BIDI: &[char] = &[
    '\u{061C}', '\u{200E}', '\u{200F}', '\u{202A}', '\u{202B}', '\u{202C}', '\u{202D}', '\u{202E}',
    '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}', '\u{200B}', '\u{200C}', '\u{200D}', '\u{FEFF}',
];

/// Replace control characters with spaces, drop bidi/zero-width characters, collapse nothing
/// else, and cap at `max_chars` characters (adds an ellipsis when cut).
pub fn sanitize_text(input: &str, max_chars: usize) -> String {
    let mut out = String::new();
    let mut n = 0usize;
    for c in input.chars() {
        if BIDI.contains(&c) {
            continue;
        }
        let c = if c.is_control() { ' ' } else { c };
        if n >= max_chars {
            out.push('\u{2026}');
            return out;
        }
        out.push(c);
        n += 1;
    }
    out
}

/// Like [`sanitize_text`], and additionally strips `user:pass@` and `?query`/`#fragment` parts
/// of URL-looking targets, which often carry credentials.
pub fn sanitize_target(input: &str, max_chars: usize) -> String {
    if let Some(i) = input.find("://") {
        let (scheme, rest) = input.split_at(i + 3);
        let rest_no_q = rest.split(['?', '#']).next().unwrap_or(rest);
        let (authority, path) = match rest_no_q.find('/') {
            Some(p) => rest_no_q.split_at(p),
            None => (rest_no_q, ""),
        };
        let authority = authority.rsplit('@').next().unwrap_or(authority);
        let rebuilt = format!("{scheme}{authority}{path}");
        return sanitize_text(&rebuilt, max_chars);
    }
    sanitize_text(input, max_chars)
}
