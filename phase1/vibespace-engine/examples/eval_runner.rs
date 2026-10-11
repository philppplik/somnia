//! Tool-use eval runner (outside the release path). Default is offline replay.
//!   cargo run --example eval_runner -- --out target/eval
//!   cargo run --example eval_runner -- --live-local ollama qwen3.5:9b --out target/eval
//! `--live-local` talks only to numeric loopback; no cloud route, no credentials.
use std::collections::BTreeMap;
use vibespace_engine::{evals::*, provider::*, ModelConfig};
#[tokio::main]
async fn main() -> Result<(), String> {
    let a: Vec<String> = std::env::args().collect();
    let flag = |n: &str| a.iter().position(|x| x == n);
    let out = flag("--out").and_then(|i| a.get(i + 1)).cloned().unwrap_or("target/eval".into());
    let dir = env!("CARGO_MANIFEST_DIR");
    let fixtures = load_fixtures(&std::fs::read_to_string(format!("{dir}/evals/tool_use.json")).map_err(|e| e.to_string())?).map_err(|_| "fixtures")?;
    let report = if let Some(i) = flag("--live-local") {
        let kind = match a.get(i + 1).map(String::as_str) {
            Some("ollama") => ProviderKind::Ollama,
            Some("lmstudio") => ProviderKind::LmStudio,
            _ => return Err("provider must be ollama or lmstudio".into()),
        };
        let model = a.get(i + 2).ok_or("model id")?;
        let m = ProviderModel::new(kind, None, model, None, true).map_err(|_| "local config")?;
        let cfg = ModelConfig::Local { endpoint: kind.default_endpoint().into(), model: model.clone() };
        run(&m, &cfg, &fixtures, "live local (loopback)").await
    } else {
        let rec: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(format!("{dir}/evals/recorded/reference-replay.json")).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let replies: BTreeMap<String, serde_json::Value> = rec["replies"].as_object().ok_or("replies")?.clone().into_iter().collect();
        let cfg = ModelConfig::Local { endpoint: "http://127.0.0.1:11434/v1/chat/completions".into(), model: "Qwen3.5-9B".into() };
        run(&ReplayModel { replies, propose: true }, &cfg, &fixtures, "offline replay (synthetic reference)").await
    };
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    std::fs::write(format!("{out}/report.json"), serde_json::to_string_pretty(&report).unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(format!("{out}/report.md"), markdown(&report)).map_err(|e| e.to_string())?;
    println!("{}/{} passed -> {out}/report.md", report.passed, report.total);
    Ok(())
}
