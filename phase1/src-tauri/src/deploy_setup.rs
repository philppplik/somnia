//! First-time setup. Credentials live only for this call, never in targets or diagnostic output.
use crate::deploy::{bootstrap::{self, BootstrapOutcome, BootstrapParams, Privilege}, host_keys::HostKeyStore, ssh::{self, ConnectOptions, Credential, RusshTransport, SshTarget}};
use crate::deploy_guard::DeployService;
use crate::deploy_targets::{Target, TargetKind};
use serde::Serialize;
use std::{collections::BTreeSet, net::IpAddr, sync::Arc, time::Duration};
use zeroize::Zeroizing;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapView { pub outcome: &'static str, pub steps: Vec<String>, pub host_fingerprint: Option<String>, pub port: Option<u16> }

pub fn params(service: &DeployService, id: &str) -> Result<BootstrapParams, String> {
    let t = service.targets.get(id).map_err(|_| "deploy:target-not-found")?;
    Ok(BootstrapParams { site: t.id, public_key: service.key_public(id).map_err(|e| e.to_string())?, node: t.kind == TargetKind::Node })
}

pub async fn run(service: &DeployService, id: &str, login_user: String, login_password: Zeroizing<String>, sudo_password: Zeroizing<String>, privilege: &str) -> Result<BootstrapView, String> {
    let t = service.targets.get(id).map_err(|_| "deploy:target-not-found")?;
    // Refuse unknown hosts before even probing or sending a credential. Never auto-trust.
    let pin = service.pins.pinned(&t.host, t.port).ok_or("deploy:host-key-unknown")?;
    if login_password.is_empty() || login_password.chars().any(|c| matches!(c, '\r' | '\n')) || sudo_password.chars().any(|c| matches!(c, '\r' | '\n')) || login_password.len() > 4096 || sudo_password.len() > 4096 { return Err("deploy:invalid-input".into()); }
    let p = params(service, id)?;
    let mode = match privilege {
        "root" if login_user == "root" => Privilege::Root,
        "sudo-passwordless" if login_user != "root" => Privilege::SudoPasswordless,
        "sudo-password" if login_user != "root" && !sudo_password.is_empty() => Privilege::SudoPassword(sudo_password),
        _ => return Err("deploy:invalid-input".into()),
    };
    let target = SshTarget::new(&t.host, t.port, login_user);
    let mut opts = ConnectOptions::default();
    opts.exec_timeout = Duration::from_secs(600);
    let observed = ssh::probe_host_key(&target, &opts).await.map_err(|_| "deploy:connect-failed")?;
    if observed.fingerprint != pin { return Err("deploy:host-key-changed".into()); }
    // Connection-local verification object, not a second persistent pin store. D7 owns persistence.
    let verified = Arc::new(HostKeyStore::default());
    verified.trust_new(&t.host, t.port, &observed).map_err(|_| "deploy:host-key-rejected")?;
    let secrets = match &mode { Privilege::SudoPassword(pw) => vec![pw.to_string()], _ => vec![] };
    let mut transport = RusshTransport::connect(&target, verified, Credential::Password(&login_password), opts, secrets).await.map_err(|_| "deploy:auth-failed")?;
    let result = bootstrap::run(&mut transport, &p, mode, &|_| {}).await;
    transport.close().await;
    let report = result.map_err(|_| "deploy:bootstrap-failed")?;
    let (outcome, port) = match report.outcome { BootstrapOutcome::Done => ("done", None), BootstrapOutcome::SudoDenied => ("sudo-denied", None), BootstrapOutcome::UnsupportedServer(_) => ("unsupported-server", None), BootstrapOutcome::PortInUse(port) => ("port-in-use", Some(port)), BootstrapOutcome::Failed(_) => ("failed", None) };
    Ok(BootstrapView { outcome, port, steps: report.steps, host_fingerprint: report.host_fingerprint })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsRecord { pub name: String, pub r#type: &'static str, pub values: Vec<String>, pub source: &'static str, pub ready: bool }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsCheck { pub ready: bool, pub expected: Vec<String>, pub records: Vec<DnsRecord>, pub stale_ipv6: bool, pub www_missing: bool, pub resolver_failed: bool }

pub fn evaluate(expected: Vec<String>, mut records: Vec<DnsRecord>, resolver_failed: bool) -> DnsCheck {
    let expected_set: BTreeSet<_> = expected.iter().collect();
    for r in &mut records {
        // Empty AAAA is normal for IPv4-only servers. Every existing address must be correct.
        r.ready = !r.values.is_empty() && r.values.iter().all(|ip| expected_set.contains(ip));
    }
    let stale_ipv6 = records.iter().any(|r| r.r#type == "AAAA" && r.values.iter().any(|ip| !expected_set.contains(ip)));
    let www_missing = !records.iter().any(|r| r.name.starts_with("www.") && !r.values.is_empty());
    let ready = !resolver_failed && !expected.is_empty() && !stale_ipv6 && !www_missing &&
        records.iter().filter(|r| r.source == "system").all(|r| r.ready) &&
        records.iter().filter(|r| !r.values.is_empty()).all(|r| r.ready) &&
        records.iter().filter(|r| r.source == "system").all(|r| records.iter().any(|other| other.source == "doh" && other.name == r.name && other.ready));
    DnsCheck { ready, expected, records, stale_ipv6, www_missing, resolver_failed }
}

pub async fn dns_check(t: &Target) -> Result<DnsCheck, String> {
    t.validate().map_err(|_| "deploy:invalid-input")?;
    let domain = t.domain.as_deref().ok_or("deploy:invalid-input")?;
    let expected = resolve(&t.host).await.unwrap_or_default();
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(10)).build().map_err(|_| "deploy:dns-failed")?;
    let mut records = vec![];
    let mut failed = expected.is_empty();
    for name in [domain.to_string(), format!("www.{domain}")] {
        match resolve(&name).await {
            Ok(values) => {
                for kind in ["A", "AAAA"] {
                    let subset: Vec<String> = values.iter().filter(|v| v.contains(':') == (kind == "AAAA")).cloned().collect();
                    if !subset.is_empty() { records.push(DnsRecord { name: name.clone(), r#type: kind, values: subset, source: "system", ready: false }); }
                }
            },
            Err(_) => { failed = true; records.push(DnsRecord { name: name.clone(), r#type: "A", values: vec![], source: "system", ready: false }); }
        }
        for kind in ["A", "AAAA"] {
            let request = client.get("https://cloudflare-dns.com/dns-query").header("Accept", "application/dns-json").query(&[("name", name.as_str()), ("type", kind)]);
            let answer = async { request.send().await?.error_for_status()?.json::<serde_json::Value>().await }.await;
            let values = match answer {
                Ok(v) if v["Status"].as_u64() == Some(0) => v["Answer"].as_array().map(|a| a.iter().filter(|r| r["type"].as_u64() == Some(if kind == "A" { 1 } else { 28 })).filter_map(|r| r["data"].as_str()?.parse::<IpAddr>().ok()).map(|ip| ip.to_string()).collect()).unwrap_or_default(),
                _ => { failed = true; vec![] }
            };
            records.push(DnsRecord { name: name.clone(), r#type: kind, values, source: "doh", ready: false });
        }
    }
    Ok(evaluate(expected, records, failed))
}
async fn resolve(host: &str) -> Result<Vec<String>, ()> {
    if let Ok(ip) = host.parse::<IpAddr>() { return Ok(vec![ip.to_string()]); }
    let values = tokio::time::timeout(Duration::from_secs(10), tokio::net::lookup_host((host, 0))).await.map_err(|_| ())?.map_err(|_| ())?;
    Ok(values.map(|v| v.ip().to_string()).collect::<BTreeSet<_>>().into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn records() -> Vec<DnsRecord> {
        ["example.com", "www.example.com"].into_iter().flat_map(|name| [("system", "A", vec!["203.0.113.10".into()]), ("doh", "A", vec!["203.0.113.10".into()]), ("doh", "AAAA", vec![])].into_iter().map(move |(source, kind, values)| DnsRecord { name: name.into(), r#type: kind, values, source, ready: false })).collect()
    }
    #[test] fn no_aaaa_is_ready() { assert!(evaluate(vec!["203.0.113.10".into()], records(), false).ready); }
    #[test] fn stale_aaaa_blocks() { let mut r = records(); r[2].values.push("2001:db8::bad".into()); let c = evaluate(vec!["203.0.113.10".into()], r, false); assert!(!c.ready); assert!(c.stale_ipv6); }
    #[test] fn resolver_failure_is_not_ready() { assert!(!evaluate(vec!["203.0.113.10".into()], records(), true).ready); }
    #[test] fn partial_address_match_is_not_ready() { let mut r = records(); r[0].values.push("198.51.100.1".into()); assert!(!evaluate(vec!["203.0.113.10".into()], r, false).ready); }
    #[test] fn www_missing_is_not_ready() { let r = records().into_iter().filter(|r| !r.name.starts_with("www.")).collect(); assert!(evaluate(vec!["203.0.113.10".into()], r, false).www_missing); }
}
