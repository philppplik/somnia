//! SKILL.md = YAML frontmatter + Markdown body (agentskills.io specification).

use serde::Deserialize;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedSkill {
    pub name: String,
    pub description: String,
    pub license: Option<String>,
    /// From `allowed-tools` (space-separated string or list). Display only, never a pre-approval.
    pub requested_tools: Vec<String>,
    pub body: String,
    pub body_lines: usize,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParseError(pub String);
impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for ParseError {}

#[derive(Deserialize)]
struct Front {
    name: Option<String>,
    description: Option<String>,
    license: Option<String>,
    #[serde(rename = "allowed-tools")]
    allowed_tools: Option<serde_yaml::Value>,
}

fn valid_name(n: &str) -> Result<(), String> {
    if n.is_empty() || n.chars().count() > 64 {
        return Err("name must be 1-64 characters".into());
    }
    if !n.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("name may only contain lowercase letters, digits and hyphens".into());
    }
    if n.starts_with('-') || n.ends_with('-') || n.contains("--") {
        return Err("name must not start/end with a hyphen or contain consecutive hyphens".into());
    }
    Ok(())
}

/// `dir_name`, when given, must equal `name` (the spec requires the folder to match).
pub fn parse_skill_md(text: &str, dir_name: Option<&str>) -> Result<ParsedSkill, ParseError> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let norm = text.replace("\r\n", "\n");
    let rest = norm
        .strip_prefix("---\n")
        .ok_or_else(|| ParseError("SKILL.md must start with a --- frontmatter block".into()))?;
    let end = rest
        .find("\n---\n")
        .map(|i| (i, i + 5))
        .or_else(|| rest.strip_suffix("\n---").map(|r| (r.len(), rest.len())))
        .ok_or_else(|| ParseError("frontmatter is not closed with ---".into()))?;
    let (yaml, body) = (&rest[..end.0], &rest[end.1..]);
    let f: Front = serde_yaml::from_str(yaml).map_err(|e| ParseError(format!("invalid frontmatter: {e}")))?;
    let name = f.name.ok_or_else(|| ParseError("frontmatter needs `name`".into()))?;
    valid_name(&name).map_err(ParseError)?;
    if let Some(d) = dir_name {
        if d != name {
            return Err(ParseError(format!("folder name {d:?} must match skill name {name:?}")));
        }
    }
    let description = f.description.ok_or_else(|| ParseError("frontmatter needs `description`".into()))?;
    let description = description.trim().to_string();
    if description.is_empty() || description.chars().count() > 1024 {
        return Err(ParseError("description must be 1-1024 characters".into()));
    }
    let requested_tools = match f.allowed_tools {
        None => vec![],
        Some(serde_yaml::Value::String(s)) => s.split_whitespace().map(str::to_string).collect(),
        Some(serde_yaml::Value::Sequence(v)) => v
            .into_iter()
            .filter_map(|x| x.as_str().map(str::to_string))
            .collect(),
        Some(_) => return Err(ParseError("allowed-tools must be a string or a list".into())),
    };
    let body_lines = body.lines().count();
    let mut warnings = vec![];
    if body_lines > 500 {
        warnings.push(format!("SKILL.md body has {body_lines} lines (the standard recommends under 500)"));
    }
    if !requested_tools.is_empty() {
        warnings.push("allowed-tools is shown as requested only; it never pre-approves anything".into());
    }
    Ok(ParsedSkill {
        name,
        description,
        license: f.license,
        requested_tools,
        body: body.to_string(),
        body_lines,
        warnings,
    })
}
