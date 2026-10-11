//! Real HTTP parsing against loopback deterministic fixtures, never a paid provider.
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
};
use vibespace_engine::*;
fn server(body: &str, status: &str) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let body = body.to_string();
    let status = status.to_string();
    let thread = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut bytes = vec![];
        let mut buf = [0u8; 4096];
        loop {
            let n = stream.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            bytes.extend_from_slice(&buf[..n]);
            if let Some(index) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                let header = String::from_utf8_lossy(&bytes[..index]);
                let size: usize = header
                    .lines()
                    .find_map(|line| {
                        line.to_lowercase()
                            .strip_prefix("content-length:")
                            .map(|s| s.trim().parse().unwrap())
                    })
                    .unwrap_or(0);
                if bytes.len() >= index + 4 + size {
                    break;
                }
            }
        }
        write!(stream,"HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",status,body.len(),body).unwrap();
        String::from_utf8(bytes).unwrap()
    });
    (format!("http://{addr}/v1/chat/completions"), thread)
}
fn config(endpoint: String) -> ModelConfig {
    ModelConfig::Local {
        endpoint,
        model: "Qwen3.5-9B".into(),
    }
}
#[tokio::test]
async fn readonly_http_real_parser_and_no_tools() {
    let (endpoint, server) = server(
        r#"{"choices":[{"message":{"content":"hello"}}],"usage":{"prompt_tokens":7,"completion_tokens":2}}"#,
        "200 OK",
    );
    let c = config(endpoint);
    let model = HttpModel::new(c.clone(), None, false).unwrap();
    let reply = model
        .complete(ModelInput {
            config: c,
            messages: vec![ModelMessage::text("user", "hello".into())],
        })
        .await
        .unwrap();
    assert_eq!(reply.message, "hello");
    assert_eq!(reply.usage.input_tokens, 7);
    assert!(reply.tool.is_none());
    let request = server.join().unwrap();
    assert!(!request.contains("authorization:"));
    assert!(!request.contains("tools"));
    assert!(request.contains("Qwen3.5-9B"));
}
#[tokio::test]
async fn parses_only_host_proposal_tool() {
    let (endpoint, server) = server(
        r#"{"choices":[{"message":{"content":null,"tool_calls":[{"id":"x","function":{"name":"somnia_propose_effect","arguments":"{\"name\":\"write\",\"arguments\":{\"path\":\"a\"}}"}}]}}]}"#,
        "200 OK",
    );
    let c = config(endpoint);
    let model = HttpModel::new(c.clone(), None, true).unwrap();
    let reply = model
        .complete(ModelInput {
            config: c,
            messages: vec![],
        })
        .await
        .unwrap();
    assert_eq!(reply.tool.unwrap().name, "write");
    assert!(server.join().unwrap().contains("somnia_propose_effect"));
}
#[tokio::test]
async fn readonly_rejects_tool_calls() {
    let (endpoint, server) = server(
        r#"{"choices":[{"message":{"tool_calls":[{"id":"x","function":{"name":"shell","arguments":"{}"}}]}}]}"#,
        "200 OK",
    );
    let c = config(endpoint);
    let model = HttpModel::new(c.clone(), None, false).unwrap();
    assert!(matches!(
        model
            .complete(ModelInput {
                config: c,
                messages: vec![]
            })
            .await,
        Err(Failure::Model)
    ));
    server.join().unwrap();
}
#[tokio::test]
async fn http_failure_not_provider_body() {
    let (endpoint, server) = server("secret-token-in-error", "401 Unauthorized");
    let c = config(endpoint);
    let model = HttpModel::new(c.clone(), None, false).unwrap();
    assert!(matches!(
        model
            .complete(ModelInput {
                config: c,
                messages: vec![]
            })
            .await,
        Err(Failure::Model)
    ));
    server.join().unwrap();
}
