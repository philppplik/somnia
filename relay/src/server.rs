//! WebSocket server: one task per connection, rooms do the fan-out.
//!
//! Wire contract (v0, until the collab protocol workstream finalises it):
//! - `GET /room/<room-id>` upgrades to WebSocket. Room id: 8-128 URL-safe chars.
//! - `GET /healthz` answers 200 and closes (liveness for proxies/monitors).
//! - Every other path answers 404 without a banner.
//! - After the upgrade only binary frames are accepted. They are forwarded
//!   verbatim to every other member of the room. The relay never reads,
//!   stores or transforms payloads.

use std::io;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, WebSocketConfig};
use tokio_tungstenite::tungstenite::Message;

use crate::limits::{Admission, IpLimiter, TrafficLimiter};
use crate::rooms::{JoinError, Membership, Rooms};
use crate::{room_log_tag, valid_room_id};

#[derive(Clone, Debug)]
pub struct Config {
    /// Largest accepted WebSocket message (one relayed frame) in bytes.
    pub max_frame_bytes: usize,
    /// Global cap on simultaneously open rooms.
    pub max_rooms: usize,
    /// Cap on members per room.
    pub max_clients_per_room: u32,
    /// Frames buffered per room before a slow member is disconnected.
    pub broadcast_capacity: usize,
    /// TCP connection attempts accepted per source IP per minute.
    pub handshakes_per_min: u32,
    /// Open WebSocket connections allowed per source IP.
    pub max_open_per_ip: u32,
    /// Per-connection send budget: frames per second.
    pub frames_per_sec: u32,
    /// Per-connection send budget: frame burst size.
    pub frame_burst: u32,
    /// Per-connection send budget: payload bytes per second.
    pub bytes_per_sec: u64,
    /// Per-connection send budget: payload byte burst.
    pub byte_burst: u64,
    /// Server WebSocket ping interval.
    pub heartbeat_interval: Duration,
    /// Drop the connection when nothing at all arrived for this long.
    pub heartbeat_timeout: Duration,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            max_frame_bytes: 2 * 1024 * 1024,
            max_rooms: 256,
            max_clients_per_room: 16,
            broadcast_capacity: 256,
            handshakes_per_min: 60,
            max_open_per_ip: 32,
            frames_per_sec: 100,
            frame_burst: 300,
            bytes_per_sec: 1_000_000,
            byte_burst: 5_000_000,
            heartbeat_interval: Duration::from_secs(30),
            heartbeat_timeout: Duration::from_secs(75),
        }
    }
}

struct Shared {
    config: Config,
    rooms: Rooms,
    limiter: IpLimiter,
}

/// Run until `shutdown` flips to `true`, then close sessions politely.
pub async fn serve(
    listener: TcpListener,
    config: Config,
    shutdown: watch::Receiver<bool>,
) -> io::Result<()> {
    let shared = Arc::new(Shared {
        rooms: Rooms::new(
            config.max_rooms,
            config.max_clients_per_room,
            config.broadcast_capacity,
        ),
        limiter: IpLimiter::new(config.handshakes_per_min, config.max_open_per_ip),
        config,
    });

    // Periodically drop stale per-IP entries.
    {
        let shared = Arc::clone(&shared);
        let mut shutdown = shutdown.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(60));
            loop {
                tokio::select! {
                    _ = tick.tick() => shared.limiter.sweep(),
                    _ = shutdown.changed() => return,
                }
            }
        });
    }

    let mut shutdown_accept = shutdown.clone();
    loop {
        let (stream, peer) = tokio::select! {
            accepted = listener.accept() => accepted?,
            _ = shutdown_accept.changed() => {
                tracing::info!("shutting down: no new connections");
                return Ok(());
            }
        };
        let shared = Arc::clone(&shared);
        let shutdown_conn = shutdown.clone();
        tokio::spawn(async move {
            if let Err(err) = handle_conn(stream, peer, shared, shutdown_conn).await {
                tracing::debug!(%peer, error = %err, "connection ended with error");
            }
        });
    }
}

/// Errors we answer with an HTTP status before or during the upgrade.
fn http_error(status: StatusCode, body: &'static str) -> ErrorResponse {
    let mut response = ErrorResponse::new(Some(body.to_string()));
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert("content-type", "text/plain".parse().unwrap());
    response
        .headers_mut()
        .insert("connection", "close".parse().unwrap());
    response
}

/// Monotonic clock for liveness checks (milliseconds since process start).
fn now_ms() -> u64 {
    use std::sync::OnceLock;
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_millis() as u64
}

enum Control {
    Pong(bytes::Bytes),
    Close(u16, &'static str),
}

// The WebSocket handshake callback signature is fixed by tungstenite.
#[allow(clippy::result_large_err)]
async fn handle_conn(
    stream: TcpStream,
    peer: SocketAddr,
    shared: Arc<Shared>,
    shutdown: watch::Receiver<bool>,
) -> io::Result<()> {
    let ip = peer.ip();
    match shared.limiter.admit(ip) {
        Admission::Ok => {}
        reason => {
            let (status, body) = match reason {
                Admission::TooManyHandshakes => ("429 Too Many Requests", "too many attempts"),
                Admission::TooManyConnections => ("429 Too Many Requests", "too many connections"),
                Admission::Ok => unreachable!(),
            };
            write_raw_http(stream, status, body).await?;
            tracing::debug!(%peer, body, "connection refused before handshake");
            return Ok(());
        }
    }

    // Plain-HTTP health checks are answered before any WebSocket parsing:
    // tungstenite (correctly) refuses to send 2xx answers from its error path.
    match sniff_healthz(&stream).await {
        Ok(true) => {
            write_raw_http(stream, "200 OK", "ok\n").await?;
            return Ok(());
        }
        Ok(false) => {}
        Err(_) => return Ok(()), // peer vanished while sniffing
    }

    // Handshake. The callback runs before any upgrade validation, so unknown
    // paths and room admission become plain HTTP answers.
    let mut join: Option<Result<Membership, (StatusCode, &'static str)>> = None;
    let rooms = shared.rooms.clone();
    let callback = |request: &Request, response: Response| -> Result<Response, ErrorResponse> {
        let path = request.uri().path();
        if path == "/healthz" {
            return Err(http_error(StatusCode::OK, "ok\n"));
        }
        let Some(room_id) = path.strip_prefix("/room/") else {
            return Err(http_error(StatusCode::NOT_FOUND, "not found\n"));
        };
        if !valid_room_id(room_id) {
            return Err(http_error(StatusCode::NOT_FOUND, "not found\n"));
        }
        let tag = room_log_tag(room_id);
        match rooms.join(room_id, tag) {
            Ok(membership) => {
                join = Some(Ok(membership));
                Ok(response)
            }
            Err(JoinError::RoomFull) => {
                Err(http_error(StatusCode::SERVICE_UNAVAILABLE, "room full\n"))
            }
            Err(JoinError::TooManyRooms) => {
                Err(http_error(StatusCode::SERVICE_UNAVAILABLE, "relay busy\n"))
            }
        }
    };

    let mut ws_config = WebSocketConfig::default();
    ws_config.max_message_size = Some(shared.config.max_frame_bytes);
    ws_config.max_frame_size = Some(shared.config.max_frame_bytes);
    let handshake =
        tokio_tungstenite::accept_hdr_async_with_config(stream, callback, Some(ws_config));
    let ws = match tokio::time::timeout(Duration::from_secs(10), handshake).await {
        Ok(inner) => inner,
        Err(_) => {
            tracing::debug!(%peer, "handshake timeout");
            return Ok(());
        }
    };
    let ws = match ws {
        Ok(ws) => ws,
        Err(err) => {
            // Handshake refusals (404/429/503/healthz) already sent their
            // HTTP answer inside tungstenite; nothing more to do.
            tracing::trace!(%peer, error = %err, "no websocket session");
            return Ok(());
        }
    };
    let membership = match join {
        Some(Ok(m)) => m,
        // Unreachable in practice: callback errors abort the handshake above.
        _ => return Ok(()),
    };
    shared.limiter.opened(ip);
    let _guard = OpenGuard {
        limiter: &shared.limiter,
        ip,
    };

    let tag = membership.tag.clone();
    let client_id = membership.client_id;
    tracing::info!(%peer, room = %tag, client_id, "client joined");

    let last_seen = Arc::new(AtomicU64::new(now_ms()));
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (control_tx, mut control_rx) = mpsc::channel::<Control>(8);
    let mut traffic = TrafficLimiter::new(
        shared.config.frames_per_sec,
        shared.config.frame_burst,
        shared.config.bytes_per_sec,
        shared.config.byte_burst,
    );

    // Writer: forwards room traffic, control frames and heartbeats.
    let writer_last_seen = Arc::clone(&last_seen);
    let writer = {
        let mut rx = membership.rx.resubscribe();
        let mut shutdown = shutdown.clone();
        let config = shared.config.clone();
        tokio::spawn(async move {
            let mut heartbeat = tokio::time::interval(config.heartbeat_interval);
            heartbeat.tick().await; // first tick is immediate; skip it
            loop {
                tokio::select! {
                    incoming = rx.recv() => match incoming {
                        Ok(frame) => {
                            if frame.sender == client_id {
                                continue;
                            }
                            if ws_tx.send(Message::Binary(frame.payload)).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                            // Never silently drop sync data: disconnect the
                            // slow peer so its client resyncs from scratch.
                            tracing::info!(client_id, skipped, "slow consumer disconnected");
                            let frame = CloseFrame { code: CloseCode::Again, reason: "too slow, resync".into() };
                            let _ = ws_tx.send(Message::Close(Some(frame))).await;
                            break;
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    },
                    control = control_rx.recv() => match control {
                        Some(Control::Pong(payload)) => {
                            if ws_tx.send(Message::Pong(payload)).await.is_err() {
                                break;
                            }
                        }
                        Some(Control::Close(code, reason)) => {
                            let frame = CloseFrame { code: CloseCode::from(code), reason: reason.into() };
                            let _ = ws_tx.send(Message::Close(Some(frame))).await;
                            break;
                        }
                        None => break,
                    },
                    _ = heartbeat.tick() => {
                        let idle = now_ms().saturating_sub(writer_last_seen.load(Ordering::Relaxed));
                        if idle > config.heartbeat_timeout.as_millis() as u64 {
                            tracing::debug!(client_id, "heartbeat timeout");
                            break; // dropping the sink closes the TCP connection
                        }
                        if ws_tx.send(Message::Ping(bytes::Bytes::new())).await.is_err() {
                            break;
                        }
                    },
                    _ = shutdown.changed() => {
                        let frame = CloseFrame { code: CloseCode::Away, reason: "relay shutting down".into() };
                        let _ = ws_tx.send(Message::Close(Some(frame))).await;
                        break;
                    },
                }
            }
        })
    };

    // Reader: admission control for inbound frames, liveness, close handling.
    // When the reader stops, control_tx is dropped; the writer drains a queued
    // close frame and finishes, which we then wait for below.
    let mut writer = std::pin::pin!(writer);
    let mut control_tx = Some(control_tx);
    loop {
        tokio::select! {
            message = ws_rx.next(), if control_tx.is_some() => {
                let Some(message) = message else {
                    drop(control_tx.take());
                    continue;
                };
                last_seen.store(now_ms(), Ordering::Relaxed);
                let mut stop = false;
                match message {
                    Ok(Message::Binary(payload)) => {
                        if !traffic.allow(payload.len()) {
                            tracing::info!(%peer, room = %tag, client_id, "rate limit exceeded");
                            if let Some(tx) = &control_tx {
                                let _ = tx.send(Control::Close(1008, "rate limit")).await;
                            }
                            stop = true;
                        } else {
                            membership.publish(payload);
                        }
                    }
                    Ok(Message::Ping(payload)) => {
                        if let Some(tx) = &control_tx {
                            if tx.send(Control::Pong(payload)).await.is_err() {
                                stop = true;
                            }
                        }
                    }
                    Ok(Message::Pong(_)) => {}
                    Ok(Message::Text(_)) => {
                        if let Some(tx) = &control_tx {
                            let _ = tx.send(Control::Close(1003, "binary frames only")).await;
                        }
                        stop = true;
                    }
                    Ok(Message::Close(_)) => stop = true,
                    Ok(_) => {} // reserved frame kinds: ignore
                    Err(err) => {
                        tracing::debug!(%peer, error = %err, "read error");
                        stop = true;
                    }
                }
                if stop {
                    drop(control_tx.take());
                }
            }
            _ = &mut writer => break,
        }
    }
    if !writer.is_finished() {
        let _ = tokio::time::timeout(Duration::from_secs(2), &mut writer).await;
    }
    tracing::info!(%peer, room = %tag, client_id, "client left");
    Ok(())
}

struct OpenGuard<'a> {
    limiter: &'a IpLimiter,
    ip: std::net::IpAddr,
}

impl Drop for OpenGuard<'_> {
    fn drop(&mut self) {
        self.limiter.closed(self.ip);
    }
}

/// Peeks at the start of the request line without consuming it: plain-HTTP
/// health checks get a plain-HTTP answer, everything else proceeds untouched
/// to the WebSocket handshake. Bounded by a header timeout so slow clients
/// cannot occupy a task forever.
async fn sniff_healthz(stream: &TcpStream) -> io::Result<bool> {
    const TARGET: &[u8] = b"GET /healthz";
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut buf = [0u8; 16];
    loop {
        let n = stream.peek(&mut buf).await?;
        if n == 0 {
            return Ok(false);
        }
        let have = &buf[..n.min(TARGET.len())];
        let common = have
            .iter()
            .zip(TARGET.iter())
            .take_while(|(a, b)| a == b)
            .count();
        // Any byte that diverges from the health path: not a health check.
        if common < have.len() {
            return Ok(false);
        }
        // Everything so far matches; a full match is a health check.
        if common == TARGET.len() {
            return Ok(true);
        }
        // Proper prefix: wait for the rest of the request line (bounded).
        if Instant::now() > deadline {
            return Ok(false);
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

/// Minimal plain-HTTP refusal for connections rejected before any WebSocket
/// parsing (per-IP admission). No banner, no details.
async fn write_raw_http(mut stream: TcpStream, status: &str, body: &str) -> io::Result<()> {
    use tokio::io::AsyncWriteExt;
    let response = format!(
        "HTTP/1.1 {status}\r\ncontent-type: text/plain\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes()).await
}
