//! Content-addressed, immutable SHA-256 object store.
//!
//! Layout: `<root>/objects/<2 hex>/<62 hex>`; temporary files live in `<root>/tmp`.
//! Objects are written to a temp file, fsynced, then renamed into place and made read-only.
//! Every read re-hashes the bytes and fails with `CorruptObject` on mismatch.

use crate::digest::Digest;
use crate::error::{Error, Result};
use crate::fsutil::{sync_dir, unique_name};
use sha2::{Digest as _, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct ObjectStore {
    root: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CorruptEntry {
    pub digest: Option<Digest>,
    pub path: PathBuf,
    pub reason: String,
}

const CHUNK: usize = 64 * 1024;

/// Hash a reader, failing if it yields more than `max` bytes.
pub(crate) fn hash_reader(r: &mut dyn Read, max: u64) -> Result<(Digest, u64)> {
    let mut h = Sha256::new();
    let mut buf = vec![0u8; CHUNK];
    let mut n = 0u64;
    loop {
        let k = r.read(&mut buf).map_err(|e| Error::io("read", e))?;
        if k == 0 {
            break;
        }
        n += k as u64;
        if n > max {
            return Err(Error::QuotaExceeded {
                what: "file bytes",
                limit: max,
                path: None,
            });
        }
        h.update(&buf[..k]);
    }
    Ok((Digest::from_hasher(h), n))
}

impl ObjectStore {
    pub fn open(root: impl Into<PathBuf>) -> Result<ObjectStore> {
        let root = root.into();
        for d in ["objects", "tmp"] {
            fs::create_dir_all(root.join(d))
                .map_err(|e| Error::io(format!("create {}", root.join(d).display()), e))?;
        }
        Ok(ObjectStore { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn object_path(&self, d: &Digest) -> PathBuf {
        let h = d.to_hex();
        self.root.join("objects").join(&h[..2]).join(&h[2..])
    }

    pub fn contains(&self, d: &Digest) -> bool {
        self.object_path(d).is_file()
    }

    pub fn put_bytes(&self, bytes: &[u8]) -> Result<Digest> {
        let mut r = bytes;
        Ok(self.put_reader(&mut r, u64::MAX)?.0)
    }

    /// Stream `r` into the store. Returns the digest and length. Existing objects are verified
    /// instead of being rewritten (deduplication); a corrupt existing object is an error, never
    /// silently replaced.
    pub fn put_reader(&self, r: &mut dyn Read, max: u64) -> Result<(Digest, u64)> {
        let tmp = self.root.join("tmp").join(unique_name("obj"));
        let res = self.put_reader_inner(r, max, &tmp);
        if res.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        res
    }

    fn put_reader_inner(&self, r: &mut dyn Read, max: u64, tmp: &Path) -> Result<(Digest, u64)> {
        let mut f = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(tmp)
            .map_err(|e| Error::io("create temp object", e))?;
        let mut h = Sha256::new();
        let mut buf = vec![0u8; CHUNK];
        let mut n = 0u64;
        loop {
            let k = r.read(&mut buf).map_err(|e| Error::io("read source", e))?;
            if k == 0 {
                break;
            }
            n += k as u64;
            if n > max {
                return Err(Error::QuotaExceeded {
                    what: "file bytes",
                    limit: max,
                    path: None,
                });
            }
            h.update(&buf[..k]);
            f.write_all(&buf[..k])
                .map_err(|e| Error::io("write temp object", e))?;
        }
        f.sync_all().map_err(|e| Error::io("sync temp object", e))?;
        drop(f);
        let d = Digest::from_hasher(h);
        let dest = self.object_path(&d);
        if dest.exists() {
            self.verify(&d)?;
            let _ = fs::remove_file(tmp);
            return Ok((d, n));
        }
        let dir = dest.parent().unwrap();
        fs::create_dir_all(dir).map_err(|e| Error::io("create object dir", e))?;
        let mut perm = fs::metadata(tmp)
            .map_err(|e| Error::io("stat temp object", e))?
            .permissions();
        perm.set_readonly(true);
        fs::set_permissions(tmp, perm).map_err(|e| Error::io("chmod temp object", e))?;
        if let Err(e) = fs::rename(tmp, &dest) {
            // A concurrent writer may have stored the same object (Windows cannot replace read-only files).
            if dest.exists() && self.verify(&d).is_ok() {
                let _ = fs::remove_file(tmp);
                return Ok((d, n));
            }
            return Err(Error::io("publish object", e));
        }
        sync_dir(dir);
        Ok((d, n))
    }

    fn open_object(&self, d: &Digest) -> Result<File> {
        File::open(self.object_path(d)).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                Error::MissingObject(*d)
            } else {
                Error::io(format!("open object {d}"), e)
            }
        })
    }

    /// Re-hash an object and compare with its name.
    pub fn verify(&self, d: &Digest) -> Result<()> {
        let mut f = self.open_object(d)?;
        let (got, _) = hash_reader(&mut f, u64::MAX)?;
        if got != *d {
            return Err(Error::CorruptObject {
                digest: *d,
                reason: format!("content hashes to {got}"),
            });
        }
        Ok(())
    }

    /// Read a whole object, verified.
    pub fn get_bytes(&self, d: &Digest) -> Result<Vec<u8>> {
        let mut f = self.open_object(d)?;
        let mut v = Vec::new();
        f.read_to_end(&mut v)
            .map_err(|e| Error::io(format!("read object {d}"), e))?;
        if Digest::of(&v) != *d {
            return Err(Error::CorruptObject {
                digest: *d,
                reason: "digest mismatch".into(),
            });
        }
        Ok(v)
    }

    /// Stream a verified object into `w`. Bytes are written before the final check, so on
    /// `CorruptObject` the caller must discard whatever `w` received (callers write to temp files).
    pub fn copy_to(&self, d: &Digest, w: &mut dyn Write) -> Result<u64> {
        let mut f = self.open_object(d)?;
        let mut h = Sha256::new();
        let mut buf = vec![0u8; CHUNK];
        let mut n = 0u64;
        loop {
            let k = f
                .read(&mut buf)
                .map_err(|e| Error::io(format!("read object {d}"), e))?;
            if k == 0 {
                break;
            }
            h.update(&buf[..k]);
            w.write_all(&buf[..k]).map_err(|e| Error::io("write", e))?;
            n += k as u64;
        }
        let got = Digest::from_hasher(h);
        if got != *d {
            return Err(Error::CorruptObject {
                digest: *d,
                reason: format!("content hashes to {got}"),
            });
        }
        Ok(n)
    }

    /// Scan every object. Unexpected names and mismatching content are reported.
    pub fn verify_all(&self) -> Result<Vec<CorruptEntry>> {
        let mut bad = Vec::new();
        let objs = self.root.join("objects");
        for sub in fs::read_dir(&objs).map_err(|e| Error::io("read objects dir", e))? {
            let sub = sub.map_err(|e| Error::io("read objects dir", e))?;
            let sname = sub.file_name().to_string_lossy().into_owned();
            let sp = sub.path();
            if !sp.is_dir() || sname.len() != 2 {
                bad.push(CorruptEntry {
                    digest: None,
                    path: sp,
                    reason: "unexpected entry".into(),
                });
                continue;
            }
            for o in fs::read_dir(&sp).map_err(|e| Error::io("read object dir", e))? {
                let o = o.map_err(|e| Error::io("read object dir", e))?;
                let name = format!("{sname}{}", o.file_name().to_string_lossy());
                match Digest::from_hex(&name) {
                    None => bad.push(CorruptEntry {
                        digest: None,
                        path: o.path(),
                        reason: "unexpected name".into(),
                    }),
                    Some(d) => {
                        if let Err(e) = self.verify(&d) {
                            bad.push(CorruptEntry {
                                digest: Some(d),
                                path: o.path(),
                                reason: e.to_string(),
                            });
                        }
                    }
                }
            }
        }
        bad.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(bad)
    }
}
