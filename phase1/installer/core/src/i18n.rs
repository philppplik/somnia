use std::collections::BTreeMap;

pub const LOCALES: [(&str, &str); 5] = [
    ("en", include_str!("../locales/en.json")),
    ("de", include_str!("../locales/de.json")),
    ("es", include_str!("../locales/es.json")),
    ("fr", include_str!("../locales/fr.json")),
    ("pt-BR", include_str!("../locales/pt-BR.json")),
];

pub fn table(code: &str) -> BTreeMap<String, String> {
    let raw = LOCALES.iter().find(|(c, _)| *c == code).unwrap_or(&LOCALES[0]).1;
    serde_json::from_str(raw).expect("locale json")
}

/// Map a Windows locale name (e.g. "de-DE", "pt-PT") to a supported code; default en.
pub fn pick(win_locale: &str) -> &'static str {
    let l = win_locale.to_ascii_lowercase();
    if l.starts_with("de") { "de" } else if l.starts_with("es") { "es" } else if l.starts_with("fr") { "fr" }
    else if l.starts_with("pt") { "pt-BR" } else { "en" }
}

pub fn fmt(template: &str, vars: &[(&str, &str)]) -> String {
    vars.iter().fold(template.to_string(), |s, (k, v)| s.replace(&format!("{{{k}}}"), v))
}

/// Placeholders like {version} in a string.
pub fn placeholders(s: &str) -> Vec<String> {
    let mut v = Vec::new(); let mut rest = s;
    while let Some(a) = rest.find('{') { if let Some(b) = rest[a..].find('}') { v.push(rest[a + 1..a + b].to_string()); rest = &rest[a + b + 1..]; } else { break; } }
    v.sort(); v
}
