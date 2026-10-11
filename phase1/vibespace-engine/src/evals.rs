//! DE+EN tool-use eval harness. Lives outside the release path (library module used only by
//! `examples/eval_runner.rs` and tests). Replays recorded replies offline by default; a live
//! run is only possible against a loopback local model chosen explicitly by the operator.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize)]
pub struct Fixture {
    pub id: String,
    pub lang: String,
    pub prompt: String,
    /// `None` = the model must NOT propose a tool (plain answer expected).
    pub expect_tool: Option<String>,
    /// Each (key -> substring) must appear in the string value of that argument.
    #[serde(default)]
    pub expect_args: BTreeMap<String, String>,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct CaseResult {
    pub id: String,
    pub lang: String,
    pub passed: bool,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct LangSummary {
    pub total: u32,
    pub passed: u32,
}
#[derive(Clone, Debug, Serialize)]
pub struct Report {
    pub model: String,
    pub source: String,
    pub total: u32,
    pub passed: u32,
    pub by_lang: BTreeMap<String, LangSummary>,
    pub cases: Vec<CaseResult>,
}
pub fn load_fixtures(json: &str) -> Result<Vec<Fixture>, Failure> {
    serde_json::from_str(json).map_err(|_| Failure::InvalidRequest)
}
pub fn score(f: &Fixture, reply: &Result<ModelReply, Failure>) -> CaseResult {
    let (passed, reason) = match reply {
        Err(_) => (false, "model call failed or reply malformed".to_string()),
        Ok(r) => match (&f.expect_tool, &r.tool) {
            (None, None) => (true, "ok".into()),
            (None, Some(t)) => (false, format!("unexpected tool proposal: {}", t.name)),
            (Some(e), None) => (false, format!("expected tool {e}, got plain answer")),
            (Some(e), Some(t)) if &t.name != e => (false, format!("expected tool {e}, got {}", t.name)),
            (Some(_), Some(t)) => {
                let miss = f.expect_args.iter().find(|(k, want)| {
                    !t.arguments.get(k.as_str()).and_then(|v| v.as_str()).is_some_and(|got| got.to_lowercase().contains(&want.to_lowercase()))
                });
                match miss {
                    Some((k, w)) => (false, format!("argument {k} missing '{w}'")),
                    None => (true, "ok".into()),
                }
            }
        },
    };
    CaseResult { id: f.id.clone(), lang: f.lang.clone(), passed, reason }
}
pub async fn run(model: &dyn ModelTransport, config: &ModelConfig, fixtures: &[Fixture], source: &str) -> Report {
    let mut cases = Vec::new();
    for f in fixtures {
        let input = ModelInput {
            config: config.clone(),
            messages: vec![
                ModelMessage::text("system", "You are a Somnia agent. To change anything, call somnia_propose_effect once; otherwise answer briefly.".into()),
                ModelMessage::text("user", f.prompt.clone()),
            ],
        };
        let reply = model.complete(input).await;
        cases.push(score(f, &reply));
    }
    let mut by_lang: BTreeMap<String, LangSummary> = BTreeMap::new();
    for c in &cases {
        let e = by_lang.entry(c.lang.clone()).or_insert(LangSummary { total: 0, passed: 0 });
        e.total += 1;
        e.passed += c.passed as u32;
    }
    Report { model: config.model().into(), source: source.into(), total: cases.len() as u32, passed: cases.iter().filter(|c| c.passed).count() as u32, by_lang, cases }
}
pub fn markdown(r: &Report) -> String {
    let mut s = format!("# Tool-use eval: {}\n\nSource: {}\n\nPassed {}/{}\n\n", r.model, r.source, r.passed, r.total);
    for (l, v) in &r.by_lang {
        s += &format!("- {}: {}/{}\n", l, v.passed, v.total);
    }
    s += "\n| case | lang | result | note |\n|---|---|---|---|\n";
    for c in &r.cases {
        s += &format!("| {} | {} | {} | {} |\n", c.id, c.lang, if c.passed { "pass" } else { "FAIL" }, c.reason);
    }
    s
}
/// Offline model: serves a recorded reply per fixture (keyed by the exact user prompt).
pub struct ReplayModel {
    pub replies: BTreeMap<String, serde_json::Value>,
    pub propose: bool,
}
#[async_trait]
impl ModelTransport for ReplayModel {
    async fn complete(&self, input: ModelInput) -> Result<ModelReply, Failure> {
        let prompt = input.messages.iter().rev().find(|m| m.role == "user").map(|m| m.content.clone()).ok_or(Failure::InvalidRequest)?;
        let v = self.replies.get(&prompt).ok_or(Failure::Model)?;
        crate::provider::decode_response(crate::provider::ProviderKind::Ollama, v, self.propose)
    }
}
