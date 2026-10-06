//! Load test client for somnia-relay. Opens N WebSocket clients spread over M
//! rooms; senders emit timestamped frames, receivers measure one-way latency
//! (same-machine clock). Run it against a local relay:
//!
//!   cargo run --release --bin somnia-relay &
//!   cargo run --release --bin loadtest -- --clients 64 --rooms 8 --duration 15
//!
//! This is a developer tool, not a benchmark suite: numbers depend on the
//! machine, the relay config and loopback behaviour. Report your own numbers.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

#[derive(Parser, Debug)]
#[command(name = "loadtest", about = "Load test client for somnia-relay")]
struct Args {
    /// Relay base URL.
    #[arg(long, default_value = "ws://127.0.0.1:8787")]
    url: String,

    /// Total WebSocket clients.
    #[arg(long, default_value_t = 32)]
    clients: u32,

    /// Rooms to spread the clients over.
    #[arg(long, default_value_t = 4)]
    rooms: u32,

    /// Test duration in seconds.
    #[arg(long, default_value_t = 10)]
    duration: u64,

    /// Payload bytes per frame (including the 8-byte timestamp).
    #[arg(long, default_value_t = 1024)]
    frame_size: usize,

    /// Frames per second each client sends (0 = as fast as possible).
    #[arg(long, default_value_t = 20)]
    send_rate: u32,
}

#[derive(Default)]
struct Stats {
    sent: AtomicU64,
    received: AtomicU64,
    connect_errors: AtomicU64,
    io_errors: AtomicU64,
    latencies_us: Mutex<Vec<u64>>,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

#[tokio::main]
async fn main() {
    let args = Args::parse();
    assert!(
        args.rooms > 0 && args.clients > 0,
        "need at least one room and one client"
    );
    assert!(
        args.frame_size >= 8,
        "frame size must fit the 8-byte timestamp"
    );

    let stats = Arc::new(Stats::default());
    let deadline = Instant::now() + Duration::from_secs(args.duration);
    let mut tasks = Vec::new();

    for index in 0..args.clients {
        let stats = Arc::clone(&stats);
        let url = format!(
            "{}/room/lt-room-{:06}",
            args.url.trim_end_matches('/'),
            index % args.rooms
        );
        let (frame_size, send_rate) = (args.frame_size, args.send_rate);
        tasks.push(tokio::spawn(async move {
            let (ws, _) = match tokio_tungstenite::connect_async(&url).await {
                Ok(ok) => ok,
                Err(err) => {
                    eprintln!("client {index}: connect failed: {err}");
                    stats.connect_errors.fetch_add(1, Ordering::Relaxed);
                    return;
                }
            };
            let (mut tx, mut rx) = ws.split();

            // Sender half.
            let send_stats = Arc::clone(&stats);
            let sender = tokio::spawn(async move {
                let mut interval = (send_rate > 0).then(|| {
                    tokio::time::interval(Duration::from_secs_f64(1.0 / send_rate as f64))
                });
                while Instant::now() < deadline {
                    if let Some(t) = interval.as_mut() {
                        t.tick().await;
                    }
                    let mut payload = now_millis().to_be_bytes().to_vec();
                    payload.resize(frame_size, b'x');
                    if tx.send(Message::Binary(payload.into())).await.is_err() {
                        send_stats.io_errors.fetch_add(1, Ordering::Relaxed);
                        return;
                    }
                    send_stats.sent.fetch_add(1, Ordering::Relaxed);
                    // Unlimited mode must still yield so receivers get CPU time.
                    if send_rate == 0 {
                        tokio::task::yield_now().await;
                    }
                }
            });

            // Receiver half (runs in this task).
            while Instant::now() < deadline {
                match rx.next().await {
                    Some(Ok(Message::Binary(payload))) => {
                        stats.received.fetch_add(1, Ordering::Relaxed);
                        if payload.len() >= 8 {
                            let sent_ms = u64::from_be_bytes(payload[..8].try_into().unwrap());
                            let latency = now_millis().saturating_sub(sent_ms);
                            stats.latencies_us.lock().unwrap().push(latency * 1000);
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => {
                        stats.io_errors.fetch_add(1, Ordering::Relaxed);
                        break;
                    }
                }
            }
            sender.abort();
        }));
    }

    for task in tasks {
        let _ = task.await;
    }

    let sent = stats.sent.load(Ordering::Relaxed);
    let received = stats.received.load(Ordering::Relaxed);
    let connect_errors = stats.connect_errors.load(Ordering::Relaxed);
    let io_errors = stats.io_errors.load(Ordering::Relaxed);
    let mut lat = stats.latencies_us.lock().unwrap().clone();
    lat.sort_unstable();
    let pct = |p: f64| -> String {
        if lat.is_empty() {
            return "n/a".into();
        }
        let i = ((lat.len() as f64 - 1.0) * p).round() as usize;
        format!("{:.1} ms", lat[i] as f64 / 1000.0)
    };
    let seconds = args.duration.max(1) as f64;
    println!("--- loadtest result ---");
    println!("clients:            {}", args.clients);
    println!("rooms:              {}", args.rooms);
    println!("duration:           {} s", args.duration);
    println!("frame size:         {} B", args.frame_size);
    println!(
        "sent:               {sent} ({:.0}/s)",
        sent as f64 / seconds
    );
    println!(
        "received:           {received} ({:.0}/s)",
        received as f64 / seconds
    );
    println!(
        "throughput out:     {:.2} MB/s",
        sent as f64 * args.frame_size as f64 / seconds / 1e6
    );
    println!("connect errors:     {connect_errors}");
    println!("io errors:          {io_errors}");
    println!(
        "latency p50/p95/p99: {} / {} / {}",
        pct(0.50),
        pct(0.95),
        pct(0.99)
    );
    println!(
        "not delivered:      {} (frames still in flight at shutdown; small numbers are normal)",
        sent.saturating_sub(received)
    );
}
