use crate::download::{ModelStatus, ModelStore};
use crate::model::ModelSpec;
use fastembed::{InitOptionsUserDefined, Pooling, TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel};
use somnia_vibespace_storage::{EmbedKind, Embedder, Error, Result};
use std::fs;
use std::sync::Mutex;

/// Local multilingual-e5-small. Loading never downloads: a missing model is an error.
pub struct E5Embedder {
    id: String,
    dims: usize,
    inner: Mutex<TextEmbedding>,
}

impl E5Embedder {
    pub fn load(store: &ModelStore, spec: &ModelSpec) -> Result<Self> {
        if store.status(spec) != ModelStatus::Ready {
            return Err(Error::Unsupported("embedding model is not downloaded".into()));
        }
        let d = store.model_dir(spec);
        let rd = |n: &str| fs::read(d.join(n)).map_err(|e| Error::Unsupported(format!("{n}: {e}")));
        let tok = TokenizerFiles {
            tokenizer_file: rd("tokenizer.json")?,
            config_file: rd("config.json")?,
            special_tokens_map_file: rd("special_tokens_map.json")?,
            tokenizer_config_file: rd("tokenizer_config.json")?,
        };
        let model = UserDefinedEmbeddingModel::new(rd("model.onnx")?, tok).with_pooling(Pooling::Mean);
        let te = TextEmbedding::try_new_from_user_defined(model, InitOptionsUserDefined::new())
            .map_err(|e| Error::Unsupported(format!("embedding runtime: {e}")))?;
        Ok(E5Embedder { id: spec.id.clone(), dims: spec.dims, inner: Mutex::new(te) })
    }
}

impl Embedder for E5Embedder {
    fn model_id(&self) -> &str {
        &self.id
    }
    fn dims(&self) -> usize {
        self.dims
    }
    fn embed(&self, texts: &[String], kind: EmbedKind) -> Result<Vec<Vec<f32>>> {
        let prefix = match kind {
            EmbedKind::Query => "query: ",
            EmbedKind::Passage => "passage: ",
        };
        let prefixed: Vec<String> = texts.iter().map(|t| format!("{prefix}{t}")).collect();
        let mut g = self.inner.lock().map_err(|_| Error::LockPoisoned)?;
        g.embed(prefixed, Some(32)).map_err(|e| Error::Unsupported(format!("embed: {e}")))
    }
}
