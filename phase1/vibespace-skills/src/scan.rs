//! Static scan of a skill bundle. Findings are evidence for the user, not a safety guarantee.
//! `high` findings keep the skill at `unreviewed`; a clean scan only reaches `scanned`.

use somnia_vibespace_storage::skills::{ScanFinding, ScanReport, SkillFile};

pub const SCANNER_VERSION: u32 = 1;

struct Rule {
    id: &'static str,
    severity: &'static str,
    /// Lowercased substrings.
    needles: &'static [&'static str],
    /// Only applies to script-like files (not Markdown prose).
    scripts_only: bool,
}

const RULES: &[Rule] = &[
    Rule { id: "conceal-from-user", severity: "high", scripts_only: false, needles: &[
        "do not tell the user", "don't tell the user", "without telling the user", "do not mention this to the user",
        "hide this from the user", "never reveal this", "do not inform the user", "keep this secret from the user"] },
    Rule { id: "instruction-override", severity: "high", scripts_only: false, needles: &[
        "ignore previous instructions", "ignore all previous instructions", "ignore your instructions",
        "disregard the system prompt", "override your safety", "you are now in developer mode"] },
    Rule { id: "shell-pipe-exec", severity: "high", scripts_only: false, needles: &[
        "| sh", "| bash", "|sh", "|bash", "| zsh", "| python", "| sudo", "iex (", "invoke-expression", "base64 -d |", "base64 --decode |"] },
    Rule { id: "credential-path", severity: "high", scripts_only: false, needles: &[
        ".ssh/", "id_rsa", ".aws/credentials", ".npmrc", ".netrc", ".git-credentials", "/etc/shadow", "keychain",
        "login data", "cookies.sqlite", ".config/gcloud", ".kube/config", "credential manager"] },
    Rule { id: "network-call", severity: "medium", scripts_only: true, needles: &[
        "curl ", "wget ", "http://", "https://", "fetch(", "requests.", "urllib", "invoke-webrequest", "nc -e", "socket.connect"] },
    Rule { id: "eval-exec", severity: "medium", scripts_only: true, needles: &["eval(", "eval ", "exec(", "os.system", "subprocess", "child_process", "powershell -enc"] },
    Rule { id: "destructive", severity: "medium", scripts_only: true, needles: &["rm -rf", "del /f", "format c:", "mkfs", "dd if="] },
    Rule { id: "env-secrets", severity: "medium", scripts_only: false, needles: &["$aws_secret", "api_key", "api-key", "secret_key", "process.env", "os.environ"] },
];

fn is_script(path: &str) -> bool {
    let l = path.to_lowercase();
    l.starts_with("scripts/")
        || [".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd", ".py", ".js", ".mjs", ".ts", ".rb", ".pl"].iter().any(|e| l.ends_with(e))
}

fn excerpt(line: &str) -> String {
    let t = line.trim();
    let mut s: String = t.chars().take(120).collect();
    if t.chars().count() > 120 {
        s.push('…');
    }
    s
}

fn hidden_char(c: char) -> bool {
    matches!(c, '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2060}'..='\u{2064}' | '\u{2066}'..='\u{2069}' | '\u{feff}' | '\u{e0000}'..='\u{e007f}')
}

fn scan_text(file: &str, text: &str, out: &mut Vec<ScanFinding>) {
    let script = is_script(file);
    let mut in_comment = false;
    for (i, line) in text.lines().enumerate() {
        let n = i + 1;
        let low = line.to_lowercase();
        for r in RULES {
            if r.scripts_only && !script {
                continue;
            }
            if r.needles.iter().any(|x| low.contains(x)) {
                out.push(ScanFinding { rule: r.id.into(), severity: r.severity.into(), file: file.into(), line: n, excerpt: excerpt(line) });
            }
        }
        if line.chars().any(hidden_char) {
            out.push(ScanFinding { rule: "hidden-unicode".into(), severity: "high".into(), file: file.into(), line: n, excerpt: excerpt(&line.chars().filter(|c| !hidden_char(*c)).collect::<String>()) });
        }
        // HTML comments can hide instructions from a reader of rendered Markdown.
        let opens = low.contains("<!--");
        if opens || in_comment {
            out.push(ScanFinding { rule: "hidden-comment".into(), severity: "high".into(), file: file.into(), line: n, excerpt: excerpt(line) });
        }
        if opens && !low.contains("-->") {
            in_comment = true;
        }
        if low.contains("-->") {
            in_comment = false;
        }
        // Long unbroken base64-like blobs.
        if line.split_whitespace().any(|w| w.len() >= 120 && w.chars().all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')) {
            out.push(ScanFinding { rule: "obfuscated-blob".into(), severity: "high".into(), file: file.into(), line: n, excerpt: excerpt(line) });
        }
    }
}

pub fn scan_bundle(skill_md: &str, files: &[SkillFile]) -> ScanReport {
    let mut findings = vec![];
    scan_text("SKILL.md", skill_md, &mut findings);
    for f in files {
        scan_text(&f.path, &f.content, &mut findings);
    }
    findings.sort_by(|a, b| (a.file.as_str(), a.line, a.rule.as_str()).cmp(&(b.file.as_str(), b.line, b.rule.as_str())));
    findings.dedup();
    let passed = !findings.iter().any(|f| f.severity == "high");
    ScanReport { findings, passed, scanner_version: SCANNER_VERSION }
}
