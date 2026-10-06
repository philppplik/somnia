//! End-to-end tests: real TCP listener, real WebSocket clients.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Error as WsError;
use tokio_tungstenite::tungstenite::Message;

use somnia_relay::{serve, Config};

struct TestRelay {
    base: String,
    shutdown: tokio::sync::watch::Sender<bool>,
}

impl TestRelay {
    async fn start(config: Config) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (shutdown, rx) = tokio::sync::watch::channel(false);
        tokio::spawn(async move { serve(listener, config, rx).await });
        Self {
            base: format!("ws://{addr}"),
            shutdown,
        }
    }

    fn room(&self, id: &str) -> String {
        format!("{}/room/{id}", self.base)
    }
}

impl Drop for TestRelay {
    fn drop(&mut self) {
        let _ = self.shutdown.send(true);
    }
}

fn test_config() -> Config {
    Config {
        heartbeat_interval: Duration::from_secs(60),
        heartbeat_timeout: Duration::from_secs(120),
        ..Config::default()
    }
}

#[tokio::test]
async fn fanout_between_two_clients_and_no_self_echo() {
    let relay = TestRelay::start(test_config()).await;
    let url = relay.room("test-room-0001");
    let (mut a, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    let (mut b, _) = tokio_tungstenite::connect_async(&url).await.unwrap();

    a.send(Message::Binary(b"opaque-encrypted-payload".to_vec().into()))
        .await
        .unwrap();

    let got = tokio::time::timeout(Duration::from_secs(2), b.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(matches!(got, Message::Binary(ref p) if p.as_ref() == b"opaque-encrypted-payload"));

    // The sender must not receive its own frame.
    let own = tokio::time::timeout(Duration::from_millis(300), a.next()).await;
    assert!(own.is_err(), "sender received an unexpected frame: {own:?}");
}

#[tokio::test]
async fn rooms_are_isolated() {
    let relay = TestRelay::start(test_config()).await;
    let (mut a, _) = tokio_tungstenite::connect_async(relay.room("test-room-0001"))
        .await
        .unwrap();
    let (mut outsider, _) = tokio_tungstenite::connect_async(relay.room("test-room-0002"))
        .await
        .unwrap();

    a.send(Message::Binary(b"secret".to_vec().into()))
        .await
        .unwrap();
    let leaked = tokio::time::timeout(Duration::from_millis(300), outsider.next()).await;
    assert!(leaked.is_err(), "frame leaked across rooms");
}

#[tokio::test]
async fn text_frames_are_rejected() {
    let relay = TestRelay::start(test_config()).await;
    let (mut a, _) = tokio_tungstenite::connect_async(relay.room("test-room-0001"))
        .await
        .unwrap();
    a.send(Message::Text("hello".into())).await.unwrap();
    let close = tokio::time::timeout(Duration::from_secs(2), a.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    match close {
        Message::Close(Some(frame)) => assert_eq!(u16::from(frame.code), 1003),
        other => panic!("expected close 1003, got {other:?}"),
    }
}

#[tokio::test]
async fn bad_paths_get_http_errors() {
    let relay = TestRelay::start(test_config()).await;

    let err = tokio_tungstenite::connect_async(format!("{}/nope", relay.base))
        .await
        .unwrap_err();
    match err {
        WsError::Http(response) => assert_eq!(response.status(), 404),
        other => panic!("expected http 404, got {other:?}"),
    }

    // Too short / invalid characters.
    let err = tokio_tungstenite::connect_async(format!("{}/room/bad%20id", relay.base))
        .await
        .unwrap_err();
    match err {
        WsError::Http(response) => assert_eq!(response.status(), 404),
        other => panic!("expected http 404, got {other:?}"),
    }
}

#[tokio::test]
async fn healthz_answers_200_without_websocket() {
    let relay = TestRelay::start(test_config()).await;
    let err = tokio_tungstenite::connect_async(format!("{}/healthz", relay.base))
        .await
        .unwrap_err();
    match err {
        WsError::Http(response) => {
            assert_eq!(response.status(), 200);
            assert_eq!(response.body().as_deref(), Some(b"ok\n".as_slice()));
        }
        other => panic!("expected http 200, got {other:?}"),
    }
}

#[tokio::test]
async fn room_capacity_is_enforced() {
    let config = Config {
        max_clients_per_room: 2,
        ..test_config()
    };
    let relay = TestRelay::start(config).await;
    let url = relay.room("test-room-0001");
    let (_a, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    let (_b, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    let err = tokio_tungstenite::connect_async(&url).await.unwrap_err();
    match err {
        WsError::Http(response) => assert_eq!(response.status(), 503),
        other => panic!("expected http 503, got {other:?}"),
    }
}

#[tokio::test]
async fn send_budget_disconnects_flooder() {
    let config = Config {
        frames_per_sec: 5,
        frame_burst: 5,
        ..test_config()
    };
    let relay = TestRelay::start(config).await;
    let (mut a, _) = tokio_tungstenite::connect_async(relay.room("test-room-0001"))
        .await
        .unwrap();

    // Blast far more frames than the burst allows; the relay must cut us off.
    for _ in 0..50 {
        if a.send(Message::Binary(vec![0u8; 16].into())).await.is_err() {
            break;
        }
    }
    let mut closed_with_limit = false;
    while let Ok(Some(msg)) = tokio::time::timeout(Duration::from_secs(2), a.next()).await {
        match msg {
            Ok(Message::Close(Some(frame))) => {
                closed_with_limit = u16::from(frame.code) == 1008;
                break;
            }
            Ok(_) => continue,
            Err(_) => break,
        }
    }
    assert!(
        closed_with_limit,
        "flooding client was not disconnected with 1008"
    );
}

#[tokio::test]
async fn late_joiner_gets_no_replay() {
    // Blind relay: an empty room holds no state. Whoever joins later receives
    // nothing until a live peer sends. Clients sync among themselves.
    let relay = TestRelay::start(test_config()).await;
    let url = relay.room("test-room-0001");
    {
        let (mut first, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
        first
            .send(Message::Binary(b"while you were away".to_vec().into()))
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let (mut late, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    let replayed = tokio::time::timeout(Duration::from_millis(300), late.next()).await;
    assert!(
        replayed.is_err(),
        "relay replayed frames; it must store nothing"
    );
}
