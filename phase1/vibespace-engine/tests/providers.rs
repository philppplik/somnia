//! Adapter tests against recorded fixtures and loopback servers. No live APIs.
use serde_json::json;
use std::{io::{Read, Write}, net::TcpListener, thread};
use vibespace_engine::{evals::*, inventory::*, provider::*, *};

fn msgs() -> Vec<ModelMessage> {
    vec![ModelMessage::text("system", "sys".into()), ModelMessage::text("user", "hi".into())]
}
#[test]
fn anthropic_encodes_system_and_tool_and_has_no_credentials() {
    let b = encode_request(ProviderKind::Anthropic, "claude-x", &msgs(), true);
    assert_eq!(b["system"], "sys");
    assert_eq!(b["messages"].as_array().unwrap().len(), 1);
    assert_eq!(b["tools"][0]["name"], "somnia_propose_effect");
    assert_eq!(b["tool_choice"]["disable_parallel_tool_use"], true);
    assert!(!b.to_string().contains("api_key"));
}
#[test]
fn openai_family_encoding_matches_http_model_shape() {
    for k in [ProviderKind::Ollama, ProviderKind::LmStudio, ProviderKind::OpenAi, ProviderKind::OpenRouter] {
        let b = encode_request(k, "m", &msgs(), false);
        assert!(b.get("tools").is_none());
        assert_eq!(b["stream"], false);
    }
    let b = encode_request(ProviderKind::OpenAi, "m", &msgs(), true);
    assert_eq!(b["parallel_tool_calls"], false);
}
#[test]
fn anthropic_tool_result_roundtrip_encoding() {
    let mut m = msgs();
    m.push(ModelMessage { role: "assistant".into(), content: "".into(), tool_calls: Some(json!([{"id":"t1","function":{"name":"somnia_propose_effect","arguments":"{\"name\":\"read_file\",\"arguments\":{\"path\":\"a\"}}"}}])), tool_call_id: None });
    m.push(ModelMessage { role: "tool".into(), content: "data".into(), tool_calls: None, tool_call_id: Some("t1".into()) });
    let b = encode_request(ProviderKind::Anthropic, "c", &m, true);
    let arr = b["messages"].as_array().unwrap();
    assert_eq!(arr[1]["content"][0]["type"], "tool_use");
    assert_eq!(arr[1]["content"][0]["input"]["name"], "read_file");
    assert_eq!(arr[2]["content"][0]["tool_use_id"], "t1");
}
#[test]
fn anthropic_decode_recorded_fixture() {
    let v = json!({"content":[{"type":"text","text":"ok"},{"type":"tool_use","id":"tu","name":"somnia_propose_effect","input":{"name":"write_file","arguments":{"path":"a"}}}],"usage":{"input_tokens":11,"output_tokens":4}});
    let r = decode_response(ProviderKind::Anthropic, &v, true).unwrap();
    assert_eq!(r.tool.unwrap().name, "write_file");
    assert_eq!(r.usage.input_tokens, 11);
}
#[test]
fn anthropic_decode_rejects_bad_replies() {
    let ok = json!({"content":[{"type":"tool_use","id":"tu","name":"somnia_propose_effect","input":{"name":"w","arguments":{}}}]});
    assert!(decode_response(ProviderKind::Anthropic, &ok, false).is_err()); // read-only mode
    for v in [
        json!({"content":[]}),
        json!({"content":[{"type":"text","text":" "}]}),
        json!({"content":[{"type":"tool_use","id":"x","name":"shell","input":{"name":"a","arguments":{}}}]}),
        json!({"content":[{"type":"tool_use","id":"x","name":"somnia_propose_effect","input":{"name":"a","arguments":{},"approved":true}}]}),
        json!({"content":[{"type":"image"}]}),
        json!({}),
    ] {
        assert!(decode_response(ProviderKind::Anthropic, &v, true).is_err(), "{v}");
    }
}
#[test]
fn credential_rules_per_provider() {
    let s = || Some(Secret::new("k".into()));
    assert!(ProviderModel::new(ProviderKind::Ollama, None, "m", None, false).is_ok());
    assert!(ProviderModel::new(ProviderKind::Ollama, None, "m", s(), false).is_err());
    assert!(ProviderModel::new(ProviderKind::Ollama, Some("http://localhost:11434/v1/chat/completions"), "m", None, false).is_err());
    assert!(ProviderModel::new(ProviderKind::OpenAi, None, "m", None, false).is_err());
    assert!(ProviderModel::new(ProviderKind::OpenAi, Some("http://api.example.com/v1"), "m", s(), false).is_err());
    assert!(ProviderModel::new(ProviderKind::Anthropic, None, "m", s(), true).is_ok());
    assert!(ProviderModel::new(ProviderKind::OpenRouter, None, "", s(), true).is_err());
}
fn serve(body: &'static str, path_hint: &'static str) -> (String, thread::JoinHandle<String>) {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = l.local_addr().unwrap();
    let t = thread::spawn(move || {
        let (mut s, _) = l.accept().unwrap();
        s.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
        let mut b = vec![];
        let mut buf = [0u8; 4096];
        loop {
            let n = s.read(&mut buf).unwrap();
            b.extend_from_slice(&buf[..n]);
            if n == 0 { break; }
            if let Some(i) = b.windows(4).position(|w| w == b"\r\n\r\n") {
                let h = String::from_utf8_lossy(&b[..i]).to_lowercase();
                let size: usize = h.lines().find_map(|l| l.strip_prefix("content-length:").map(|x| x.trim().parse().unwrap())).unwrap_or(0);
                if b.len() >= i + 4 + size { break; }
            }
        }
        write!(s, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        let _ = path_hint;
        String::from_utf8(b).unwrap()
    });
    (format!("http://{addr}"), t)
}
#[tokio::test]
async fn provider_model_local_roundtrip() {
    let (base, srv) = serve(r#"{"choices":[{"message":{"content":"hallo"}}],"usage":{"prompt_tokens":3,"completion_tokens":1}}"#, "");
    let ep = format!("{base}/v1/chat/completions");
    let m = ProviderModel::new(ProviderKind::LmStudio, Some(&ep), "qwen3.5-9b", None, false).unwrap();
    let cfg = ModelConfig::Local { endpoint: ep, model: "qwen3.5-9b".into() };
    let r = m.complete(ModelInput { config: cfg, messages: msgs() }).await.unwrap();
    assert_eq!(r.message, "hallo");
    let req = srv.join().unwrap();
    assert!(req.starts_with("POST /v1/chat/completions"));
    assert!(!req.to_lowercase().contains("authorization"));
}
#[test]
fn inventory_parsers_and_trial_matching() {
    let o = parse_ollama_tags(&json!({"models":[{"name":"llama3:8b","size":4},{"name":"qwen3.5:9b","size":6000000000u64}]})).unwrap();
    assert_eq!(o.len(), 2);
    let l = parse_lmstudio_models(&json!({"data":[{"id":"Qwen3.5-9B-Instruct-GGUF"}]})).unwrap();
    assert!(is_trial_model(&l[0].id));
    for id in ["qwen3.5:9b", "qwen3.5-9b", "Qwen3.5-9B"] { assert!(is_trial_model(id), "{id}"); }
    for id in ["qwen3.5:90b", "qwen3.5:2b", "qwen3:9b", "gemma3:9b", "llama3:8b"] { assert!(!is_trial_model(id), "{id}"); }
    assert!(parse_ollama_tags(&json!({"x":1})).is_err());
}
#[test]
fn readiness_states_and_hints_never_auto_download() {
    assert!(matches!(readiness(ProviderKind::Ollama, None), Readiness::ServerDown { .. }));
    let m = readiness(ProviderKind::Ollama, Some(vec![LocalModel { id: "llama3:8b".into(), size_bytes: None }]));
    match m { Readiness::ModelMissing { setup_hint, .. } => assert!(setup_hint.contains("ollama pull qwen3.5:9b") && setup_hint.contains("nothing is downloaded automatically")), _ => panic!() }
    let r = readiness(ProviderKind::Ollama, Some(vec![LocalModel { id: "qwen3.5:9b".into(), size_bytes: None }]));
    assert!(matches!(r, Readiness::Ready { .. }));
}
#[tokio::test]
async fn probe_loopback_only_and_down_detection() {
    assert!(probe(ProviderKind::OpenAi, "http://127.0.0.1:1").await.is_err());
    assert!(probe(ProviderKind::Ollama, "http://localhost:11434").await.is_err());
    assert!(probe(ProviderKind::Ollama, "http://192.168.1.5:11434").await.is_err());
    assert_eq!(probe(ProviderKind::Ollama, "http://127.0.0.1:1").await.unwrap(), None);
    let (base, srv) = serve(r#"{"models":[{"name":"qwen3.5:9b","size":1}]}"#, "");
    let got = probe(ProviderKind::Ollama, &base).await.unwrap().unwrap();
    assert_eq!(got[0].id, "qwen3.5:9b");
    assert!(srv.join().unwrap().starts_with("GET /api/tags"));
}
#[tokio::test]
async fn eval_harness_produces_report_from_recorded_fixtures() {
    let dir = env!("CARGO_MANIFEST_DIR");
    let fx = load_fixtures(&std::fs::read_to_string(format!("{dir}/evals/tool_use.json")).unwrap()).unwrap();
    assert!(fx.iter().filter(|f| f.lang == "de").count() >= 8 && fx.iter().filter(|f| f.lang == "en").count() >= 8);
    let rec: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(format!("{dir}/evals/recorded/reference-replay.json")).unwrap()).unwrap();
    let replies = rec["replies"].as_object().unwrap().clone().into_iter().collect();
    let cfg = ModelConfig::Local { endpoint: "http://127.0.0.1:11434/v1/chat/completions".into(), model: "Qwen3.5-9B".into() };
    let r = run(&ReplayModel { replies, propose: true }, &cfg, &fx, "test").await;
    assert_eq!(r.total as usize, fx.len());
    assert_eq!(r.total - r.passed, 2); // the two deliberate misses are detected
    assert!(r.cases.iter().any(|c| c.id == "de-04" && !c.passed));
    assert!(markdown(&r).contains("FAIL"));
    assert_eq!(r.by_lang.len(), 2);
}

#[test]
fn usage_cache_and_cost_come_only_from_provider_responses() {
    // OpenAI-style: cached tokens inside prompt_tokens_details; no cost field -> None, never estimated.
    let v = json!({"choices":[{"message":{"content":"x"}}],"usage":{"prompt_tokens":100,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":64}}});
    let u = decode_response(ProviderKind::OpenAi, &v, false).unwrap().usage;
    assert_eq!((u.input_tokens, u.cache_read_tokens, u.cache_write_tokens, u.cost_usd, u.cost_source), (100, Some(64), None, None, None));
    // OpenRouter: provider-reported cost is copied with its source.
    let v = json!({"choices":[{"message":{"content":"x"}}],"usage":{"prompt_tokens":10,"completion_tokens":2,"cost":0.00123,"prompt_tokens_details":{"cached_tokens":0,"cache_write_tokens":4}}});
    let u = decode_response(ProviderKind::OpenRouter, &v, false).unwrap().usage;
    assert_eq!((u.cost_usd, u.cost_source, u.cache_read_tokens, u.cache_write_tokens), (Some(0.00123), Some(CostSource::ProviderReported), Some(0), Some(4)));
    // Same field on a non-OpenRouter route is ignored; bad values are ignored.
    let v = json!({"choices":[{"message":{"content":"x"}}],"usage":{"cost":9.0}});
    assert_eq!(decode_response(ProviderKind::Ollama, &v, false).unwrap().usage.cost_usd, None);
    let v = json!({"choices":[{"message":{"content":"x"}}],"usage":{"cost":-1.0}});
    assert_eq!(decode_response(ProviderKind::OpenRouter, &v, false).unwrap().usage.cost_usd, None);
    // Anthropic cache fields.
    let v = json!({"content":[{"type":"text","text":"x"}],"usage":{"input_tokens":5,"output_tokens":2,"cache_read_input_tokens":900,"cache_creation_input_tokens":30}});
    let u = decode_response(ProviderKind::Anthropic, &v, false).unwrap().usage;
    assert_eq!((u.input_tokens, u.cache_read_tokens, u.cache_write_tokens, u.cost_usd), (5, Some(900), Some(30), None));
    // Local server without usage details: unknown stays unknown.
    let v = json!({"choices":[{"message":{"content":"x"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}});
    assert_eq!(decode_response(ProviderKind::Ollama, &v, false).unwrap().usage.cache_read_tokens, None);
}
#[test]
fn experimental_stream_is_disabled_by_default() {
 assert!(!vibespace_engine::provider::EXPERIMENTAL_OLLAMA_STREAM_ENABLED);
}
