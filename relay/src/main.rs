//! somnia-relay: blind WebSocket relay for Somnia collaboration rooms.
//! See README.md for the security model and deployment guide.

use std::net::SocketAddr;
use std::time::Duration;

use clap::Parser;
use tokio::net::TcpListener;

use somnia_relay::{serve, Config};

#[derive(Parser, Debug)]
#[command(
    name = "somnia-relay",
    version,
    about = "Blind, self-hostable relay for end-to-end encrypted Somnia collab rooms. Forwards opaque binary frames; stores nothing."
)]
struct Args {
    /// Bind address. Keep 127.0.0.1 when a reverse proxy terminates TLS on the
    /// same host; use 0.0.0.0 inside containers or trusted LANs only.
    #[arg(long, env = "SOMNIA_RELAY_BIND", default_value = "127.0.0.1:8787")]
    bind: SocketAddr,

    /// Largest relayed frame in bytes.
    #[arg(long, env = "SOMNIA_RELAY_MAX_FRAME_BYTES", default_value_t = 2 * 1024 * 1024)]
    max_frame_bytes: usize,

    /// Global cap on open rooms.
    #[arg(long, env = "SOMNIA_RELAY_MAX_ROOMS", default_value_t = 256)]
    max_rooms: usize,

    /// Members per room.
    #[arg(long, env = "SOMNIA_RELAY_MAX_CLIENTS_PER_ROOM", default_value_t = 16)]
    max_clients_per_room: u32,

    /// Frames buffered per room before a slow member is disconnected (1013).
    #[arg(long, env = "SOMNIA_RELAY_BROADCAST_CAPACITY", default_value_t = 256)]
    broadcast_capacity: usize,

    /// TCP connection attempts per source IP per minute.
    #[arg(long, env = "SOMNIA_RELAY_HANDSHAKES_PER_MIN", default_value_t = 60)]
    handshakes_per_min: u32,

    /// Open connections per source IP.
    #[arg(long, env = "SOMNIA_RELAY_MAX_OPEN_PER_IP", default_value_t = 32)]
    max_open_per_ip: u32,

    /// Per-connection send budget: frames per second.
    #[arg(long, env = "SOMNIA_RELAY_FRAMES_PER_SEC", default_value_t = 100)]
    frames_per_sec: u32,

    /// Per-connection send budget: frame burst.
    #[arg(long, env = "SOMNIA_RELAY_FRAME_BURST", default_value_t = 300)]
    frame_burst: u32,

    /// Per-connection send budget: payload bytes per second.
    #[arg(long, env = "SOMNIA_RELAY_BYTES_PER_SEC", default_value_t = 1_000_000)]
    bytes_per_sec: u64,

    /// Per-connection send budget: payload byte burst.
    #[arg(long, env = "SOMNIA_RELAY_BYTE_BURST", default_value_t = 5_000_000)]
    byte_burst: u64,

    /// Server ping interval in seconds.
    #[arg(long, env = "SOMNIA_RELAY_HEARTBEAT_SECS", default_value_t = 30)]
    heartbeat_secs: u64,

    /// Drop connections with no inbound traffic for this many seconds.
    #[arg(
        long,
        env = "SOMNIA_RELAY_HEARTBEAT_TIMEOUT_SECS",
        default_value_t = 75
    )]
    heartbeat_timeout_secs: u64,
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "somnia_relay=info".into()),
        )
        .init();

    let args = Args::parse();
    let config = Config {
        allowed_room: None,
        max_frame_bytes: args.max_frame_bytes,
        max_rooms: args.max_rooms,
        max_clients_per_room: args.max_clients_per_room,
        broadcast_capacity: args.broadcast_capacity,
        handshakes_per_min: args.handshakes_per_min,
        max_open_per_ip: args.max_open_per_ip,
        frames_per_sec: args.frames_per_sec,
        frame_burst: args.frame_burst,
        bytes_per_sec: args.bytes_per_sec,
        byte_burst: args.byte_burst,
        heartbeat_interval: Duration::from_secs(args.heartbeat_secs),
        heartbeat_timeout: Duration::from_secs(args.heartbeat_timeout_secs),
    };

    let listener = TcpListener::bind(args.bind).await?;
    tracing::info!(bind = %args.bind, "somnia-relay listening (plain ws; put a TLS reverse proxy in front)");

    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    tokio::spawn(async move {
        #[cfg(unix)]
        {
            let mut term =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("install SIGTERM handler");
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {}
                _ = term.recv() => {}
            }
        }
        #[cfg(not(unix))]
        {
            let _ = tokio::signal::ctrl_c().await;
        }
        tracing::info!("shutdown signal received, closing sessions");
        let _ = shutdown_tx.send(true);
    });

    let result = serve(listener, config, shutdown_rx).await;
    // Give close frames a moment to reach the clients.
    tokio::time::sleep(Duration::from_millis(500)).await;
    result
}
