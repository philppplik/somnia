//! `somnia-ext` custom URI scheme: serves extension worker and panel documents as their
//! own responses, each with its own CSP, so the app CSP never has to be weakened.
//!
//! URL contract (shared with the frontend):
//!   somnia-ext://worker/<ext-id>                  bootstrap JS (for a same-origin capable engine)
//!   somnia-ext://worker/<ext-id>/host?n=<nonce>   relay document that runs the bootstrap in a blob Worker
//!   somnia-ext://panel/<ext-id>/<panel-id>?n=<nonce>[#token]   panel document, served verbatim as registered
//! On Windows (WebView2) and Android Tauri rewrites custom schemes to
//! `http://somnia-ext.localhost/...`; `ext_scheme_base` returns the right base per platform.
//!
//! Documents with a nonce are single-use: the nonce is issued by the trusted frontend through
//! `ext_panel_open` / `ext_worker_open` and consumed by the first request. A reload, a
//! re-navigation or a second frame asking for the same URL gets 403.
//!
//! This module is pure Rust (no tauri types) so it is unit-tested on every platform.

use std::collections::HashMap;
use std::sync::Mutex;

pub const SCHEME: &str = "somnia-ext";
pub const WORKER_JS: &str = include_str!("../ext/worker.js");

/// Worker response CSP. `unsafe-eval` is needed by the AsyncFunction bootstrap only.
pub const WORKER_CSP: &str = "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
/// Panel response CSP, plus a `sandbox` directive so the document is an opaque origin
/// even if an embedder forgets the iframe attribute. `allow-same-origin` is never granted.
pub const PANEL_CSP: &str = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts";
/// Relay document CSP. The relay is a trusted bootstrap at the scheme origin (it runs no extension
/// code itself). It must NOT be sandboxed: its only job is to start a same-origin Worker from
/// `somnia-ext://worker/<ext-id>` (a Worker URL must be same-origin with its creator) and to relay
/// messages. The Worker gets WORKER_CSP from its own response.
pub const RELAY_CSP: &str = "default-src 'none'; script-src 'unsafe-inline'; worker-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

#[derive(Default)]
pub struct ExtRegistry {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// (ext, panel) -> entry
    panels: HashMap<(String, String), Entry>,
    /// ext -> entry (relay document)
    workers: HashMap<String, Entry>,
}

struct Entry {
    html: String,
    nonce: String,
    consumed: bool,
}

pub struct Response {
    pub status: u16,
    pub content_type: &'static str,
    pub csp: &'static str,
    pub body: Vec<u8>,
}

fn deny(status: u16) -> Response {
    Response { status, content_type: "text/plain; charset=utf-8", csp: "default-src 'none'; sandbox", body: Vec::new() }
}

/// Extension and panel ids: 1..=64 chars of [A-Za-z0-9._-], not starting with '.'.
pub fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && !s.starts_with('.')
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

fn new_nonce() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// Neutralise anything that could close the inline script early.
fn script_safe(js: &str) -> String {
    js.replace("</", "<\\/")
}

pub fn relay_document(session: &str) -> String {
    let session_js = serde_json::to_string(session).unwrap_or_else(|_| "\"\"".into());
    // Same-origin worker URL = this document's URL minus the trailing /host and the query.
    // Only the embedding window can talk to the worker; worker output is tagged with the session.
    let js = script_safe(&format!(
        "(()=>{{const S={session_js};const u=location.href.split('?')[0].replace(/\\/host$/,'');const w=new Worker(u);w.onmessage=e=>parent.postMessage({{session:S,data:e.data}},'*');w.onerror=e=>parent.postMessage({{session:S,error:String(e.message||'worker failed to start')}},'*');addEventListener('message',e=>{{if(e.source!==parent)return;w.postMessage(e.data);}});}})();"
    ));
    format!("<!doctype html><html><head><meta charset=\"utf-8\"><script>{js}</script></head><body></body></html>")
}

impl ExtRegistry {
    /// Register a panel document; returns the nonce for its single load.
    pub fn open_panel(&self, ext: &str, panel: &str, html: &str) -> Result<String, &'static str> {
        if !valid_id(ext) || !valid_id(panel) {
            return Err("invalid id");
        }
        if html.len() > 2 * 1024 * 1024 {
            return Err("panel html too large");
        }
        let nonce = new_nonce();
        self.inner.lock().map_err(|_| "lock")?.panels.insert(
            (ext.into(), panel.into()),
            Entry { html: html.into(), nonce: nonce.clone(), consumed: false },
        );
        Ok(nonce)
    }

    pub fn open_worker(&self, ext: &str) -> Result<String, &'static str> {
        if !valid_id(ext) {
            return Err("invalid id");
        }
        let nonce = new_nonce();
        self.inner
            .lock()
            .map_err(|_| "lock")?
            .workers
            .insert(ext.into(), Entry { html: String::new(), nonce: nonce.clone(), consumed: false });
        Ok(nonce)
    }

    /// Invalidate everything for an extension (dispose / disable / uninstall).
    pub fn close_ext(&self, ext: &str) {
        if let Ok(mut i) = self.inner.lock() {
            i.panels.retain(|(e, _), _| e != ext);
            i.workers.remove(ext);
        }
    }

    pub fn close_panel(&self, ext: &str, panel: &str) {
        if let Ok(mut i) = self.inner.lock() {
            i.panels.remove(&(ext.to_owned(), panel.to_owned()));
        }
    }

    pub fn clear(&self) {
        if let Ok(mut i) = self.inner.lock() {
            i.panels.clear();
            i.workers.clear();
        }
    }

    /// `path` is the URL path with the host removed ("/worker/<id>" style is NOT accepted;
    /// pass kind = URL host, path = everything after it, query separately).
    pub fn serve(&self, method: &str, host: &str, path: &str, query: &str) -> Response {
        if method != "GET" {
            return deny(405);
        }
        let segs: Vec<&str> = path.trim_start_matches('/').split('/').collect();
        let nonce = query
            .split('&')
            .find_map(|kv| kv.strip_prefix("n="))
            .unwrap_or("");
        match (host, segs.as_slice()) {
            ("worker", [ext]) if valid_id(ext) => Response {
                status: 200,
                content_type: "text/javascript; charset=utf-8",
                csp: WORKER_CSP,
                body: WORKER_JS.as_bytes().to_vec(),
            },
            ("worker", [ext, "host"]) if valid_id(ext) => {
                let Ok(mut i) = self.inner.lock() else { return deny(500) };
                match i.workers.get_mut(*ext) {
                    Some(e) if !e.consumed && !nonce.is_empty() && e.nonce == nonce => {
                        e.consumed = true;
                        html(RELAY_CSP, relay_document(&e.nonce))
                    }
                    _ => deny(403),
                }
            }
            ("panel", [ext, panel]) if valid_id(ext) && valid_id(panel) => {
                let Ok(mut i) = self.inner.lock() else { return deny(500) };
                match i.panels.get_mut(&((*ext).to_owned(), (*panel).to_owned())) {
                    Some(e) if !e.consumed && !nonce.is_empty() && e.nonce == nonce => {
                        e.consumed = true;
                        html(PANEL_CSP, e.html.clone())
                    }
                    _ => deny(403),
                }
            }
            _ => deny(404),
        }
    }
}

fn html(csp: &'static str, body: String) -> Response {
    Response { status: 200, content_type: "text/html; charset=utf-8", csp, body: body.into_bytes() }
}

/// Split a request URI into (kind, path, query). Handles both the native form
/// `somnia-ext://worker/<id>` and the Windows/Android form `http://somnia-ext.localhost/worker/<id>`.
pub fn split_uri(host: Option<&str>, path: &str, query: Option<&str>) -> (String, String, String) {
    let q = query.unwrap_or("").to_owned();
    match host {
        Some("somnia-ext.localhost") => {
            let p = path.trim_start_matches('/');
            let (k, rest) = p.split_once('/').unwrap_or((p, ""));
            (k.to_owned(), format!("/{rest}"), q)
        }
        Some(h) => (h.to_owned(), path.to_owned(), q),
        None => (String::new(), path.to_owned(), q),
    }
}

/// Base URL of the scheme as the webview must request it (no trailing slash on Windows form).
pub fn scheme_base() -> String {
    if cfg!(any(target_os = "windows", target_os = "android")) {
        "http://somnia-ext.localhost".to_owned()
    } else {
        "somnia-ext://".to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uri_forms() {
        assert_eq!(split_uri(Some("worker"), "/a", None), ("worker".into(), "/a".into(), "".into()));
        assert_eq!(
            split_uri(Some("somnia-ext.localhost"), "/panel/a/p", Some("n=1")),
            ("panel".into(), "/a/p".into(), "n=1".into())
        );
    }

    #[test]
    fn ids() {
        assert!(valid_id("acme.tool-1"));
        for bad in ["", ".x", "a/b", "a b", "a%2f", &"x".repeat(65)] {
            assert!(!valid_id(bad), "{bad}");
        }
    }

    #[test]
    fn worker_js_csp_and_no_leak() {
        let r = ExtRegistry::default();
        let w = r.serve("GET", "worker", "/acme", "");
        assert_eq!(w.status, 200);
        assert_eq!(w.csp, WORKER_CSP);
        assert!(w.csp.contains("script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'"));
        assert!(String::from_utf8(w.body).unwrap().contains("AsyncFunction"));
        assert_eq!(r.serve("POST", "worker", "/acme", "").status, 405);
        assert_eq!(r.serve("GET", "worker", "/../x", "").status, 404);
        assert_eq!(r.serve("GET", "nope", "/a", "").status, 404);
    }

    #[test]
    fn panel_single_use_and_nonce() {
        let r = ExtRegistry::default();
        let n = r.open_panel("acme", "p1", "<b>hi</b>").unwrap();
        assert_eq!(r.serve("GET", "panel", "/acme/p1", "").status, 403);
        assert_eq!(r.serve("GET", "panel", "/acme/p1", "n=wrong").status, 403);
        let ok = r.serve("GET", "panel", "/acme/p1", &format!("n={n}"));
        assert_eq!(ok.status, 200);
        assert!(ok.csp.contains("default-src 'none'") && ok.csp.contains("sandbox allow-scripts"));
        assert!(!ok.csp.contains("allow-same-origin"));
        let body = String::from_utf8(ok.body).unwrap();
        assert_eq!(body, "<b>hi</b>"); // served verbatim: the frontend builds the full document
        // second load (reload / navigation back / second frame) is refused
        assert_eq!(r.serve("GET", "panel", "/acme/p1", &format!("n={n}")).status, 403);
    }

    #[test]
    fn close_invalidates() {
        let r = ExtRegistry::default();
        let n = r.open_panel("acme", "p1", "x").unwrap();
        r.close_ext("acme");
        assert_eq!(r.serve("GET", "panel", "/acme/p1", &format!("n={n}")).status, 403);
        let n = r.open_worker("acme").unwrap();
        r.close_panel("acme", "zz");
        let ok = r.serve("GET", "worker", "/acme/host", &format!("n={n}"));
        assert_eq!(ok.status, 200);
        assert!(ok.csp.contains("worker-src 'self'") && !ok.csp.contains("allow-same-origin") && !ok.csp.contains("unsafe-eval"));
        assert_eq!(r.serve("GET", "worker", "/acme/host", &format!("n={n}")).status, 403);
    }

    #[test]
    fn script_injection_closed() {
        let d = relay_document("s");
        assert!(d.matches("</script>").count() == 1 && d.contains("e.source!==parent"));
    }

    /// Drift guard: the embedded assets must equal the TypeScript sources the app still uses.
    #[test]
    fn assets_match_frontend_sources() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/lib/extensions");
        let w = std::fs::read_to_string(dir.join("workerSource.ts")).unwrap();
        let a = w.find('`').unwrap() + 1;
        let b = w.rfind('`').unwrap();
        assert_eq!(w[a..b].trim_start_matches(['\r', '\n']), WORKER_JS);
    }
}
