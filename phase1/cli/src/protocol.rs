//! Versioned JSON-IPC protocol (R4-C1). Newline-delimited JSON frames.
//! Tokens/credentials are never a field: requests are scanned and rejected if they carry one.
use crate::error::{CliError, ErrorKind, Result};
use crate::record::{RunSummary, Status};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_FRAME_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Capability {
    Read,
    Cancel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
pub enum RequestBody {
    Hello,
    Status { task_id: String },
    Attach { task_id: String },
    Cancel { task_id: String },
}

impl RequestBody {
    pub fn required_capability(&self) -> Capability {
        match self {
            RequestBody::Cancel { .. } => Capability::Cancel,
            _ => Capability::Read,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub protocol: u32,
    pub request_id: String,
    pub capability: Capability,
    pub body: RequestBody,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "kebab-case")]
pub enum RunEvent {
    Status { status: Status },
    Plan { text: String },
    Progress { text: String },
    NeedsInput { reason: String },
    Result { summary: Box<RunSummary> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventFrame {
    pub protocol: u32,
    pub task_id: String,
    pub seq: u64,
    #[serde(flatten)]
    pub event: RunEvent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "frame", rename_all = "kebab-case")]
pub enum Frame {
    Hello { protocol: u32, request_id: String, server: String },
    Event { request_id: String, #[serde(flatten)] event: EventFrame },
    Result { request_id: String, summary: Box<RunSummary> },
    Ack { request_id: String },
    Error { request_id: String, error: CliError },
}

const FORBIDDEN_KEYS: &[&str] = &["token", "access_token", "refresh_token", "password", "secret", "authorization", "api_key", "apikey", "credential", "credentials"];

/// Reject any object key that looks like a credential, at any depth.
pub fn scan_for_secrets(v: &Value) -> Result<()> {
    match v {
        Value::Object(m) => {
            for (k, val) in m {
                if FORBIDDEN_KEYS.contains(&k.to_ascii_lowercase().as_str()) {
                    return Err(CliError::new(ErrorKind::BadRequest, "credential-like field rejected; tokens are never protocol fields"));
                }
                scan_for_secrets(val)?;
            }
            Ok(())
        }
        Value::Array(a) => a.iter().try_for_each(scan_for_secrets),
        _ => Ok(()),
    }
}

pub fn parse_request(line: &str) -> Result<Request> {
    if line.len() > MAX_FRAME_BYTES {
        return Err(CliError::new(ErrorKind::BadRequest, "frame too large"));
    }
    let v: Value = serde_json::from_str(line).map_err(|e| CliError::new(ErrorKind::BadRequest, format!("invalid json: {e}")))?;
    scan_for_secrets(&v)?;
    // Version check before strict shape check, so a newer client gets a typed mismatch.
    let proto = v.get("protocol").and_then(|p| p.as_u64()).unwrap_or(0) as u32;
    if proto != PROTOCOL_VERSION {
        return Err(CliError::new(ErrorKind::VersionMismatch, format!("server speaks protocol {PROTOCOL_VERSION}, client sent {proto}"))
            .with_details(serde_json::json!({"server": PROTOCOL_VERSION, "client": proto})));
    }
    let req: Request = serde_json::from_value(v).map_err(|e| CliError::new(ErrorKind::BadRequest, format!("invalid request: {e}")))?;
    if req.request_id.is_empty() || req.request_id.len() > 128 {
        return Err(CliError::new(ErrorKind::BadRequest, "request_id required (<=128 chars)"));
    }
    if req.capability != req.body.required_capability() {
        return Err(CliError::new(ErrorKind::BadRequest, "capability does not match request type"));
    }
    Ok(req)
}
