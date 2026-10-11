//! Pinned model description. Sizes and sha256 were read from the Hugging Face repo at the pinned commit.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileSpec {
    /// Path inside the repo, e.g. `onnx/model.onnx`.
    pub repo_path: String,
    /// File name inside the local model directory.
    pub local_name: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelSpec {
    /// Stable id stored with the user's opt-in, e.g. `multilingual-e5-small`.
    pub id: String,
    pub dims: usize,
    pub repo: String,
    pub revision: String,
    pub license: String,
    pub files: Vec<FileSpec>,
}

impl ModelSpec {
    pub fn total_bytes(&self) -> u64 {
        self.files.iter().map(|f| f.size).sum()
    }
    pub fn url(&self, base: &str, f: &FileSpec) -> String {
        format!("{}/{}/resolve/{}/{}", base.trim_end_matches('/'), self.repo, self.revision, f.repo_path)
    }
}

pub const HF_BASE: &str = "https://huggingface.co";

fn f(repo_path: &str, size: u64, sha: &str) -> FileSpec {
    FileSpec {
        local_name: repo_path.rsplit('/').next().unwrap().to_string(),
        repo_path: repo_path.to_string(),
        size,
        sha256: sha.to_string(),
    }
}

/// intfloat/multilingual-e5-small (MIT), ONNX fp32 export. ~470 MB for the model plus ~17 MB tokenizer.
pub fn e5_small() -> ModelSpec {
    ModelSpec {
        id: "multilingual-e5-small".into(),
        dims: 384,
        repo: "intfloat/multilingual-e5-small".into(),
        revision: "614241f622f53c4eeff9890bdc4f31cfecc418b3".into(),
        license: "MIT".into(),
        files: vec![
            f("onnx/model.onnx", 470_268_510, "ca456c06b3a9505ddfd9131408916dd79290368331e7d76bb621f1cba6bc8665"),
            f("tokenizer.json", 17_082_730, "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39"),
            f("config.json", 655, "69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959"),
            f("special_tokens_map.json", 167, "d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7"),
            f("tokenizer_config.json", 443, "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b"),
        ],
    }
}
