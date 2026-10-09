//! Somnia Sound Studio core: the SoundCraft audio core (decode, offline DSP, WAV render) inside a browser worker.
//!
//! Derived from the SoundCraft wasm feasibility spike. Upstream: https://github.com/storytold/soundcraft
//! (MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft Team and the SoundCraft contributors); see NOTICE.
//!
//! One call, [`process`], takes the bytes of an MP3/WAV/FLAC/OGG/AIFF file and a JSON "recipe",
//! decodes the file, runs offline (AudioSuite-style) processing and renders a 16-bit WAV, plus a
//! JSON report and waveform min/max columns for drawing. Nothing here touches the DOM, threads or
//! the file system, so the same code runs natively (tests) and as `wasm32-unknown-unknown`.
//!
//! Pipeline order: trim silence → reverse → pitch shift → plugin (e.g. reverb) → fades → normalize.
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use serde::{Deserialize, Serialize};
use soundcraft_audio_io::{AudioBuffer, BitDepth, EncodeOptions, FileFormat, decode, encode};
use soundcraft_dsp::{FadeShape, offline};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

/// Upper bound on the output length, so a hostile recipe cannot exhaust the wasm heap.
const MAX_FRAMES: usize = 48_000 * 60 * 10;

/// A plugin to run over the whole clip, by registry id (see `soundcraft-cli plugins`).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct PluginSpec {
    pub id: String,
    #[serde(default)]
    pub params: BTreeMap<String, f32>,
    /// Keep the plugin's tail (reverb ring-out) instead of cutting at the input length.
    #[serde(default)]
    pub keep_tail: bool,
}

/// What to do to the clip. Every field is optional.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Recipe {
    pub trim_silence_db: Option<f32>,
    pub reverse: bool,
    pub pitch_semitones: Option<f32>,
    pub plugin: Option<PluginSpec>,
    pub fade_in_ms: Option<f32>,
    pub fade_out_ms: Option<f32>,
    pub normalize_db: Option<f32>,
    /// Selection in seconds of the decoded input, and what to do with it. Applied before every other step.
    pub region: Option<Region>,
    /// Number of waveform columns to return (default 800, max 8192).
    pub columns: Option<usize>,
}

/// `crop` keeps only the selection, `cut` removes it, `only` runs the remaining steps on the selection and leaves the rest as is.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RegionMode {
    Crop,
    Cut,
    Only,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Region {
    pub start_s: f64,
    pub end_s: f64,
    pub mode: RegionMode,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Stats {
    pub frames: usize,
    pub sample_rate: u32,
    pub channels: usize,
    pub duration_s: f64,
    pub peak_db: f32,
    pub rms_db: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Report {
    pub format: String,
    pub input: Stats,
    pub output: Stats,
    pub trimmed_range: Option<(usize, usize)>,
    pub steps: Vec<String>,
    pub wav_bytes: usize,
}

#[derive(Debug)]
/// Result of [`run`]: rendered WAV, report, and `2 * columns` interleaved (min, max) values of the output (channels summed).
pub struct Output {
    pub wav: Vec<u8>,
    pub report: Report,
    pub peaks: Vec<f32>,
}

fn db(x: f32) -> f32 {
    if x <= 1e-7 { -140.0 } else { 20.0 * x.log10() }
}

fn stats(b: &AudioBuffer) -> Stats {
    let frames = b.frames();
    let n = (frames * b.num_channels()).max(1) as f64;
    let sq: f64 = b.channels.iter().flat_map(|c| c.iter().take(frames)).map(|&s| f64::from(s) * f64::from(s)).sum();
    Stats {
        frames,
        sample_rate: b.sample_rate,
        channels: b.num_channels(),
        duration_s: b.duration_secs(),
        peak_db: db(b.peak()),
        rms_db: db((sq / n).sqrt() as f32),
    }
}

fn ms_to_frames(ms: f32, sr: u32) -> usize {
    if ms.is_finite() && ms > 0.0 { (f64::from(ms) * f64::from(sr) / 1000.0) as usize } else { 0 }
}

/// Min/max columns of the channel-summed signal.
pub fn waveform_columns(b: &AudioBuffer, cols: usize) -> Vec<f32> {
    let cols = cols.clamp(1, 8192);
    let frames = b.frames();
    let chn = b.num_channels().max(1) as f32;
    let mut out = Vec::with_capacity(cols * 2);
    for c in 0..cols {
        let (s, e) = (c * frames / cols, ((c + 1) * frames / cols).max(c * frames / cols + 1).min(frames));
        let (mut lo, mut hi) = (0.0f32, 0.0f32);
        for i in s..e {
            let v: f32 = b.channels.iter().map(|ch| ch[i]).sum::<f32>() / chn;
            lo = lo.min(v);
            hi = hi.max(v);
        }
        out.push(lo);
        out.push(hi);
    }
    out
}

/// Pure-Rust entry point (also used by the tests).
pub fn run(bytes: &[u8], ext: Option<&str>, recipe: &Recipe) -> Result<Output, String> {
    let (info, mut buf) = decode(bytes, ext).map_err(|e| format!("decode: {e}"))?;
    if buf.frames() == 0 || buf.num_channels() == 0 {
        return Err("decode: file contains no audio".into());
    }
    let input = stats(&buf);
    let sr = buf.sample_rate;
    let mut steps = Vec::new();
    let mut trimmed = None;
    let (mut head, mut tail): (Vec<Vec<f32>>, Vec<Vec<f32>>) = (Vec::new(), Vec::new());
    if let Some(r) = &recipe.region {
        let total = buf.frames();
        if !r.start_s.is_finite() || !r.end_s.is_finite() || r.start_s < 0.0 || r.end_s <= r.start_s {
            return Err("region: start must be before end and not negative".into());
        }
        let s0 = ((r.start_s * f64::from(sr)).round() as usize).min(total);
        let e0 = ((r.end_s * f64::from(sr)).round() as usize).min(total);
        if e0 <= s0 + 1 {
            return Err("region: selection is empty".into());
        }
        match r.mode {
            RegionMode::Crop => {
                buf.channels.iter_mut().for_each(|c| *c = c[s0..e0].to_vec());
                steps.push(format!("crop {s0}..{e0}"));
            }
            RegionMode::Cut => {
                if e0 - s0 >= total {
                    return Err("region: cutting the whole clip leaves nothing".into());
                }
                buf.channels.iter_mut().for_each(|c| {
                    c.drain(s0..e0);
                });
                steps.push(format!("cut {s0}..{e0}"));
            }
            RegionMode::Only => {
                head = buf.channels.iter().map(|c| c[..s0].to_vec()).collect();
                tail = buf.channels.iter().map(|c| c[e0..].to_vec()).collect();
                buf.channels.iter_mut().for_each(|c| *c = c[s0..e0].to_vec());
                steps.push(format!("selection {s0}..{e0} only"));
            }
        }
    }
    if let Some(thr) = recipe.trim_silence_db {
        let pad = ms_to_frames(20.0, sr);
        let ranges = offline::non_silent_ranges(&buf.channels, thr, ms_to_frames(100.0, sr), pad, pad);
        if let (Some(first), Some(last)) = (ranges.first(), ranges.last()) {
            let (s, e) = (first.0, last.1.min(buf.frames()));
            buf.channels.iter_mut().for_each(|c| *c = c[s..e].to_vec());
            trimmed = Some((s, e));
            steps.push(format!("trim_silence {thr} dB -> frames {s}..{e}"));
        } else {
            return Err(format!("trim_silence: nothing above {thr} dB"));
        }
    }
    if recipe.reverse {
        offline::reverse(&mut buf.channels);
        steps.push("reverse".into());
    }
    if let Some(st) = recipe.pitch_semitones.filter(|s| s.abs() > f32::EPSILON) {
        if !st.is_finite() || st.abs() > 24.0 {
            return Err("pitch_semitones must be within -24..24".into());
        }
        buf.channels = offline::pitch_shift(&buf.channels, st, sr as f32);
        steps.push(format!("pitch_shift {st:+} st"));
    }
    if let Some(spec) = &recipe.plugin {
        let mut p = soundcraft_dsp::create(&spec.id).ok_or_else(|| format!("unknown plugin `{}`", spec.id))?;
        for (k, v) in &spec.params {
            if !p.set_param(k, *v) {
                return Err(format!("plugin `{}` has no parameter `{k}`", spec.id));
            }
        }
        if spec.keep_tail {
            buf.channels = offline::apply_plugin_with_tail(&buf.channels, p.as_mut(), sr as f32);
        } else {
            offline::apply_plugin(&mut buf.channels, p.as_mut(), sr as f32);
        }
        steps.push(format!("plugin {} {:?}{}", spec.id, spec.params, if spec.keep_tail { " +tail" } else { "" }));
    }
    let (fi, fo) = (ms_to_frames(recipe.fade_in_ms.unwrap_or(0.0), sr), ms_to_frames(recipe.fade_out_ms.unwrap_or(0.0), sr));
    if fi > 0 || fo > 0 {
        offline::fade(&mut buf.channels, fi, fo, FadeShape::EqualPower);
        steps.push(format!("fade in {fi} / out {fo} frames"));
    }
    if let Some(t) = recipe.normalize_db {
        offline::normalize(&mut buf.channels, t, false);
        steps.push(format!("normalize {t} dB"));
    }
    if !head.is_empty() || !tail.is_empty() {
        // The processed selection goes back between the untouched parts. Channel counts always match (same decoder output).
        for (i, c) in buf.channels.iter_mut().enumerate() {
            let mut joined = head.get(i).cloned().unwrap_or_default();
            joined.append(c);
            joined.extend_from_slice(tail.get(i).map(Vec::as_slice).unwrap_or(&[]));
            *c = joined;
        }
    }
    if buf.frames() > MAX_FRAMES {
        return Err("output too long".into());
    }

    let opts = EncodeOptions { format: FileFormat::Wav, bit_depth: BitDepth::Int16, dither: true, bwf: None };
    let wav = encode(&buf, &opts).map_err(|e| format!("encode: {e}"))?;
    let peaks = waveform_columns(&buf, recipe.columns.unwrap_or(800));
    let report = Report { format: format!("{:?}", info.format), input, output: stats(&buf), trimmed_range: trimmed, steps, wav_bytes: wav.len() };
    Ok(Output { wav, report, peaks })
}

/// Handle returned to JS.
#[wasm_bindgen]
pub struct SoundResult {
    wav: Vec<u8>,
    report: String,
    peaks: Vec<f32>,
}

#[wasm_bindgen]
impl SoundResult {
    /// 16-bit PCM WAV file bytes.
    #[wasm_bindgen(getter)]
    pub fn wav(&self) -> Vec<u8> {
        self.wav.clone()
    }
    /// JSON report.
    #[wasm_bindgen(getter)]
    pub fn report(&self) -> String {
        self.report.clone()
    }
    /// Interleaved (min, max) pairs.
    #[wasm_bindgen(getter)]
    pub fn peaks(&self) -> Vec<f32> {
        self.peaks.clone()
    }
}

/// `ext` is a hint ("mp3", "wav", ...), `recipe_json` a [`Recipe`] as JSON.
#[wasm_bindgen]
pub fn process(bytes: &[u8], ext: &str, recipe_json: &str) -> Result<SoundResult, JsError> {
    let recipe: Recipe = serde_json::from_str(recipe_json).map_err(|e| JsError::new(&format!("recipe: {e}")))?;
    let out = run(bytes, Some(ext), &recipe).map_err(|e| JsError::new(&e))?;
    let report = serde_json::to_string(&out.report).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(SoundResult { wav: out.wav, report, peaks: out.peaks })
}

/// Plugin ids the engine offers, as JSON `[{id,name}]`.
#[wasm_bindgen]
pub fn list_plugins() -> String {
    let v: Vec<_> =
        soundcraft_dsp::plugins().iter().map(|p| serde_json::json!({"id": p.id, "name": p.name, "instrument": p.is_instrument})).collect();
    serde_json::to_string(&v).unwrap_or_else(|_| "[]".into())
}
