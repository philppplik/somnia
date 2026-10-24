//! Discovery reads metadata only (SKILL.md frontmatter); bodies and resources load on demand.
//! Folder walking never follows symlinks and refuses anything outside the root.

use crate::parse::{parse_skill_md, ParsedSkill};
use crate::scan::scan_bundle;
use somnia_vibespace_storage::skills::*;
use somnia_vibespace_storage::{Error, Result, Store};
use std::fs;
use std::path::Path;

#[derive(Clone, Debug)]
pub struct DiscoveredSkill {
    pub dir_name: String,
    pub parsed: std::result::Result<ParsedSkill, String>,
}

/// Lists `<root>/*/SKILL.md` (one level), metadata only.
pub fn discover_dir(root: &Path) -> std::io::Result<Vec<DiscoveredSkill>> {
    let mut out = vec![];
    for e in fs::read_dir(root)? {
        let e = e?;
        let ft = e.file_type()?;
        if !ft.is_dir() || ft.is_symlink() {
            continue;
        }
        let md = e.path().join("SKILL.md");
        let Ok(meta) = fs::symlink_metadata(&md) else { continue };
        if !meta.is_file() || meta.len() as usize > MAX_SKILL_FILE_BYTES {
            continue;
        }
        let dir_name = e.file_name().to_string_lossy().to_string();
        let text = fs::read_to_string(&md)?;
        out.push(DiscoveredSkill { parsed: parse_skill_md(&text, Some(&dir_name)).map_err(|e| e.0), dir_name });
    }
    out.sort_by(|a, b| a.dir_name.cmp(&b.dir_name));
    Ok(out)
}

/// Reads a skill folder into (SKILL.md, files) without following symlinks.
pub fn read_skill_dir(dir: &Path) -> std::io::Result<(String, Vec<SkillFile>)> {
    let md = fs::read_to_string(dir.join("SKILL.md"))?;
    let mut files = vec![];
    fn walk(base: &Path, cur: &Path, files: &mut Vec<SkillFile>, total: &mut usize) -> std::io::Result<()> {
        for e in fs::read_dir(cur)? {
            let e = e?;
            let ft = e.file_type()?;
            if ft.is_symlink() {
                continue;
            }
            let p = e.path();
            if ft.is_dir() {
                walk(base, &p, files, total)?;
            } else if ft.is_file() {
                let rel = p.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/");
                if rel == "SKILL.md" {
                    continue;
                }
                let len = e.metadata()?.len() as usize;
                *total += len;
                if len > MAX_SKILL_FILE_BYTES || *total > MAX_SKILL_TOTAL_BYTES || files.len() >= MAX_SKILL_FILES {
                    return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "skill folder exceeds size limits"));
                }
                // Non-UTF-8 (binary) files are not stored: only text resources are supported in alpha.
                if let Ok(content) = fs::read_to_string(&p) {
                    files.push(SkillFile { path: rel, content });
                }
            }
        }
        Ok(())
    }
    let mut total = md.len();
    walk(dir, dir, &mut files, &mut total)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok((md, files))
}

/// Parse + scan + store. Never executes anything. Trust is derived from the scan inside storage.
pub fn install_from_files(
    store: &Store,
    scope: SkillScope,
    space_id: Option<&str>,
    source: SkillSource,
    source_ref: Option<&str>,
    pinned_commit: Option<&str>,
    skill_md: &str,
    files: Vec<SkillFile>,
    expected_dir_name: Option<&str>,
) -> Result<SkillSummary> {
    let parsed = parse_skill_md(skill_md, expected_dir_name).map_err(|e| Error::InvalidInput(e.0))?;
    let scan = scan_bundle(skill_md, &files);
    store.install_skill(NewSkillVersion {
        scope,
        space_id: space_id.map(str::to_string),
        name: parsed.name,
        description: parsed.description,
        source,
        source_ref: source_ref.map(str::to_string),
        pinned_commit: pinned_commit.map(str::to_string),
        skill_md: skill_md.to_string(),
        files,
        scan,
        requested_tools: parsed.requested_tools,
    })
}
