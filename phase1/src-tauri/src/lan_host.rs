//! Explicit, session-scoped LAN hosting. No listener exists before start().
use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr};
use tokio::{
    net::TcpListener,
    sync::{watch, Mutex},
    task::JoinHandle,
};

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanHostInfo {
    pub running: bool,
    pub lan: bool,
    pub port: u16,
    pub local_url: String,
    pub guest_urls: Vec<String>,
    pub room_id: String,
}
struct Running {
    info: LanHostInfo,
    shutdown: watch::Sender<bool>,
    task: JoinHandle<std::io::Result<()>>,
}
impl Drop for Running {
    fn drop(&mut self) {
        let _ = self.shutdown.send(true);
    }
}
#[derive(Default)]
pub struct LanHost {
    running: Mutex<Option<Running>>,
}
impl LanHost {
    pub async fn start(&self, lan: bool, port: u16) -> Result<LanHostInfo, String> {
        self.start_room(lan, port, None).await
    }
    pub async fn start_room(
        &self,
        lan: bool,
        port: u16,
        room_id: Option<String>,
    ) -> Result<LanHostInfo, String> {
        if room_id
            .as_ref()
            .is_some_and(|id| somnia_relay::rooms::managed_expiry(id).is_none())
        {
            return Err("Invalid managed session room.".into());
        }
        let mut state = self.running.lock().await;
        if let Some(r) = state.as_ref() {
            if !r.task.is_finished() {
                return Err(
                    "Sharing is already running. Stop it before changing the address or port."
                        .into(),
                );
            }
        }
        state.take();
        let bind = if lan {
            Ipv4Addr::UNSPECIFIED
        } else {
            Ipv4Addr::LOCALHOST
        };
        let listener = TcpListener::bind((bind, port))
            .await
            .map_err(|e| format!("Could not start sharing on port {port}: {e}"))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        // Two UUIDv4 values provide 244 random bits, above the wire contract minimum.
        let room_id = room_id.unwrap_or_else(|| {
            format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            )
        });
        let path = format!("/room/{room_id}");
        let local_url = format!("ws://127.0.0.1:{port}{path}");
        let guest_urls = if lan {
            private_ipv4_addresses()
                .into_iter()
                .map(|ip| format!("ws://{ip}:{port}{path}"))
                .collect()
        } else {
            vec![local_url.clone()]
        };
        let info = LanHostInfo {
            running: true,
            lan,
            port,
            local_url,
            guest_urls,
            room_id: room_id.clone(),
        };
        let config = somnia_relay::Config {
            max_rooms: 1,
            allowed_room: Some(room_id),
            ..Default::default()
        };
        let (shutdown, rx) = watch::channel(false);
        let task = tokio::spawn(somnia_relay::serve(listener, config, rx));
        *state = Some(Running {
            info: info.clone(),
            shutdown,
            task,
        });
        Ok(info)
    }
    pub async fn status(&self) -> LanHostInfo {
        let mut state = self.running.lock().await;
        if state.as_ref().is_some_and(|r| r.task.is_finished()) {
            state.take();
        }
        state.as_ref().map(|r| r.info.clone()).unwrap_or_default()
    }
    pub async fn stop(&self) -> Result<(), String> {
        // Keep the lock until the accept task exits: a concurrent start cannot race the old bind.
        let mut state = self.running.lock().await;
        if let Some(mut r) = state.take() {
            let _ = r.shutdown.send(true);
            match tokio::time::timeout(std::time::Duration::from_secs(3), &mut r.task).await {
                Ok(Ok(Ok(()))) => {}
                Ok(Ok(Err(e))) => return Err(format!("Sharing server stopped with an error: {e}")),
                Ok(Err(e)) => return Err(format!("Sharing server task failed: {e}")),
                Err(_) => {
                    r.task.abort();
                    let _ = (&mut r.task).await;
                    return Err("Sharing server shutdown timed out; listener was aborted.".into());
                }
            }
        }
        Ok(())
    }
}
fn private_ipv4_addresses() -> Vec<IpAddr> {
    let mut ips: Vec<_> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .map(|i| i.ip())
        .filter(|ip| matches!(ip, IpAddr::V4(v) if v.is_private() && !v.is_loopback()))
        .collect();
    ips.sort();
    ips.dedup();
    ips
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::{connect_async, tungstenite::Message};
    #[tokio::test]
    async fn explicit_lifecycle_and_real_fanout() {
        let host = LanHost::default();
        assert!(!host.status().await.running);
        let info = host.start(false, 0).await.unwrap();
        assert!(!info.lan);
        assert_ne!(info.port, 0);
        assert_eq!(info.guest_urls, vec![info.local_url.clone()]);
        assert!(host.start(false, 0).await.is_err());
        let (mut a, _) = connect_async(&info.local_url).await.unwrap();
        let (mut b, _) = connect_async(&info.local_url).await.unwrap();
        a.send(Message::Binary(vec![3, 1, 2, 3].into()))
            .await
            .unwrap();
        let frame = tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                if let Some(Ok(Message::Binary(b))) = b.next().await {
                    break b;
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(frame.as_ref(), &[3, 1, 2, 3]);
        let wrong = format!("ws://127.0.0.1:{}/room/not-the-session", info.port);
        assert!(connect_async(wrong).await.is_err());
        host.stop().await.unwrap();
        assert!(!host.status().await.running);
        assert!(
            tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, info.port))
                .await
                .is_err()
        );
        host.stop().await.unwrap();
        let restarted = host.start(false, info.port).await.unwrap();
        assert_ne!(restarted.room_id, info.room_id);
        assert!(connect_async(&info.local_url).await.is_err());
        host.stop().await.unwrap();
    }
    #[tokio::test]
    async fn occupied_port_fails_without_live_status() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let host = LanHost::default();
        assert!(host
            .start(false, listener.local_addr().unwrap().port())
            .await
            .is_err());
        assert!(!host.status().await.running);
    }
    #[tokio::test]
    async fn lan_binding_and_drop_close_listener() {
        let host = LanHost::default();
        let info = host.start(true, 0).await.unwrap();
        assert!(info.lan);
        assert!(
            tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, info.port))
                .await
                .is_ok()
        );
        drop(host);
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert!(
            tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, info.port))
                .await
                .is_err()
        );
    }
}
