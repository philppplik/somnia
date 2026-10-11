//! Stable, opaque filesystem identity. Paths are never part of a public DTO.
use sha2::{Digest, Sha256};
use std::{fs::Metadata, io, path::Path, time::UNIX_EPOCH};

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub struct FileIdentity {
    pub token: String,
}

/// Derive identity using the metadata pass already made by the parser.
pub fn identity_of(path: &Path, metadata: &Metadata) -> io::Result<FileIdentity> {
    #[cfg(windows)]
    let source = {
        // std's MetadataExt::volume_serial_number/file_index are unstable
        // (windows_by_handle, #63010); query the same BY_HANDLE_FILE_INFORMATION
        // fields through windows-sys on stable Rust instead.
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
        };
        let _ = metadata;
        let file = std::fs::File::open(path)?;
        let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
        if unsafe { GetFileInformationByHandle(file.as_raw_handle() as _, &mut info) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let index = ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64;
        format!("windows:{}:{}", info.dwVolumeSerialNumber, index)
    };
    #[cfg(unix)]
    let source = {
        use std::os::unix::fs::MetadataExt;
        format!("unix:{}:{}", metadata.dev(), metadata.ino())
    };
    #[cfg(not(any(windows, unix)))]
    let source = path.canonicalize()?.to_string_lossy().to_lowercase();
    let _ = path;
    Ok(FileIdentity {
        token: format!("{:x}", Sha256::digest(source.as_bytes())),
    })
}

impl FileIdentity {
    pub fn token(&self) -> &str {
        &self.token
    }
}

/// Binds an authorization to the same file version, not its name.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FileVersion {
    pub identity: FileIdentity,
    pub size: u64,
    pub modified_ns: u128,
}
impl FileVersion {
    pub fn from_metadata(path: &Path, metadata: &Metadata) -> io::Result<Self> {
        if !metadata.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Not a regular file",
            ));
        }
        Ok(Self {
            identity: identity_of(path, metadata)?,
            size: metadata.len(),
            modified_ns: metadata
                .modified()?
                .duration_since(UNIX_EPOCH)
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Invalid file timestamp"))?
                .as_nanos(),
        })
    }
    pub fn stat(path: &Path) -> io::Result<Self> {
        Self::from_metadata(path, &std::fs::metadata(path)?)
    }
    pub fn hash(&self) -> String {
        let mut hash = Sha256::new();
        hash.update(self.identity.token.as_bytes());
        hash.update(self.size.to_le_bytes());
        hash.update(self.modified_ns.to_le_bytes());
        format!("{hash:x}", hash = hash.finalize())
    }
}
