use somnia_sound::{Recipe, run};

const MP3: &[u8] = include_bytes!("fixtures/arpeggio.mp3");

fn recipe(json: &str) -> Recipe {
    serde_json::from_str(json).expect("recipe json")
}

#[test]
fn decodes_real_mp3() {
    let out = run(MP3, Some("mp3"), &recipe("{}")).expect("run");
    assert_eq!(out.report.input.sample_rate, 44_100);
    assert_eq!(out.report.input.channels, 2);
    // mp3 decoders add/trim priming samples; allow +-60 ms around 3.5 s.
    assert!((out.report.input.duration_s - 3.5).abs() < 0.06, "{}", out.report.input.duration_s);
    assert!(out.report.input.peak_db > -12.0);
}

#[test]
fn trim_removes_leading_silence() {
    let out = run(MP3, Some("mp3"), &recipe(r#"{"trim_silence_db":-50}"#)).expect("run");
    let (s, _) = out.report.trimmed_range.expect("trimmed");
    // 0.5 s of silence minus 20 ms pad, at 44.1 kHz
    assert!((20_000..22_100).contains(&s), "start {s}");
    assert!(out.report.output.duration_s < out.report.input.duration_s - 0.4);
}

#[test]
fn normalize_hits_target_and_wav_roundtrips() {
    let out = run(MP3, Some("mp3"), &recipe(r#"{"normalize_db":-1.0,"fade_in_ms":10,"fade_out_ms":200}"#)).expect("run");
    assert!((out.report.output.peak_db + 1.0).abs() < 0.1, "{}", out.report.output.peak_db);
    // the rendered WAV decodes again with the same frame count
    let back = run(&out.wav, Some("wav"), &recipe("{}")).expect("re-decode");
    assert_eq!(back.report.input.frames, out.report.output.frames);
    assert_eq!(&out.wav[..4], b"RIFF");
}

#[test]
fn reverb_tail_extends_and_pitch_keeps_duration_roughly() {
    let dry = run(MP3, Some("mp3"), &recipe("{}")).expect("dry");
    let wet = run(MP3, Some("mp3"), &recipe(r#"{"plugin":{"id":"plate_reverb","keep_tail":true}}"#)).expect("wet");
    assert!(wet.report.output.frames > dry.report.output.frames);
    let up = run(MP3, Some("mp3"), &recipe(r#"{"pitch_semitones":7}"#)).expect("pitch");
    let ratio = up.report.output.duration_s / dry.report.output.duration_s;
    assert!((0.95..1.05).contains(&ratio), "ratio {ratio}");
}

#[test]
fn peaks_have_requested_columns_and_ordering() {
    let out = run(MP3, Some("mp3"), &recipe(r#"{"columns":64}"#)).expect("run");
    assert_eq!(out.peaks.len(), 128);
    assert!(out.peaks.chunks(2).all(|p| p[0] <= p[1]));
    assert!(out.peaks.chunks(2).skip(20).any(|p| p[1] > 0.1));
}

#[test]
fn errors_are_clean() {
    assert!(run(b"not audio at all", Some("mp3"), &recipe("{}")).is_err());
    assert!(run(MP3, Some("mp3"), &recipe(r#"{"plugin":{"id":"nope"}}"#)).unwrap_err().contains("unknown plugin"));
    assert!(run(MP3, Some("mp3"), &recipe(r#"{"pitch_semitones":99}"#)).is_err());
    assert!(run(&[], Some("wav"), &recipe("{}")).is_err());
}
