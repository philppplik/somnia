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

#[test]
fn region_crop_cut_and_only() {
    let full = run(MP3, Some("mp3"), &recipe("{}")).expect("full");
    let crop = run(MP3, Some("mp3"), &recipe(r#"{"region":{"start_s":1.0,"end_s":2.0,"mode":"crop"}}"#)).expect("crop");
    assert!((crop.report.output.duration_s - 1.0).abs() < 0.001, "{}", crop.report.output.duration_s);
    let cut = run(MP3, Some("mp3"), &recipe(r#"{"region":{"start_s":1.0,"end_s":2.0,"mode":"cut"}}"#)).expect("cut");
    assert!((cut.report.output.duration_s - (full.report.output.duration_s - 1.0)).abs() < 0.001);
    // an effect on the selection only keeps the total length and leaves the outside untouched
    let only = run(MP3, Some("mp3"), &recipe(r#"{"region":{"start_s":1.0,"end_s":2.0,"mode":"only"},"reverse":true}"#)).expect("only");
    assert_eq!(only.report.output.frames, full.report.output.frames);
    let again = run(&only.wav, Some("wav"), &recipe("{}")).expect("decode only");
    let orig = run(&full.wav, Some("wav"), &recipe("{}")).expect("decode full");
    assert_eq!(again.report.output.frames, orig.report.output.frames);
    // outside the selection the render matches the original (dither allows +-2 LSB); inside it differs a lot. Samples are interleaved stereo.
    let n = (0.9 * 44100.0) as usize * 2;
    let (a, b) = (decode_ch(&again.wav), decode_ch(&orig.wav));
    let worst = |x: &[i16], y: &[i16]| x.iter().zip(y).map(|(p, q)| (i32::from(*p) - i32::from(*q)).abs()).max().unwrap_or(0);
    assert!(worst(&a[..n], &b[..n]) <= 2, "head changed");
    assert!(worst(&a[2 * 88200..], &b[2 * 88200..]) <= 2, "tail changed");
    assert!(worst(&a[2 * 44100..2 * 88200], &b[2 * 44100..2 * 88200]) > 1000, "selection unchanged");
    // peak normalisation inside a selection does not touch the rest
    let norm = run(MP3, Some("mp3"), &recipe(r#"{"region":{"start_s":2.0,"end_s":3.0,"mode":"only"},"normalize_db":-20}"#)).expect("norm");
    assert_eq!(norm.report.output.frames, full.report.output.frames);
}

#[test]
fn region_errors_are_clean() {
    for r in [
        r#"{"region":{"start_s":2.0,"end_s":1.0,"mode":"crop"}}"#,
        r#"{"region":{"start_s":-1.0,"end_s":1.0,"mode":"cut"}}"#,
        r#"{"region":{"start_s":50.0,"end_s":60.0,"mode":"crop"}}"#,
        r#"{"region":{"start_s":0.0,"end_s":100.0,"mode":"cut"}}"#,
    ] {
        assert!(run(MP3, Some("mp3"), &recipe(r)).is_err(), "{r}");
    }
}

fn decode_ch(wav: &[u8]) -> Vec<i16> {
    // 16-bit PCM after the 44 byte header written by the encoder (checked by the RIFF assert in other tests)
    let data = wav.windows(4).position(|w| w == b"data").expect("data chunk") + 8;
    wav[data..].chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect()
}

#[test]
fn progress_reports_each_stage_in_order() {
    let r = recipe(r#"{"region":{"start_s":0.5,"end_s":2.0,"mode":"only"},"reverse":true,"plugin":{"id":"plate_reverb"},"normalize_db":-1}"#);
    let mut seen: Vec<(String, usize, usize)> = Vec::new();
    somnia_sound::run_with(MP3, Some("mp3"), &r, &mut |s, i, t| seen.push((s.to_string(), i, t))).expect("run");
    let names: Vec<&str> = seen.iter().map(|(s, _, _)| s.as_str()).collect();
    assert_eq!(names, ["decode", "region", "reverse", "plugin", "normalize", "encode"]);
    assert!(seen.iter().enumerate().all(|(k, (_, i, t))| *i == k && *t == 6));
    assert_eq!(somnia_sound::stage_names(&recipe("{}")), ["decode", "encode"]);
}

#[test]
fn plugin_params_change_the_result_and_bad_ones_are_rejected() {
    let dry = run(MP3, Some("mp3"), &recipe(r#"{"plugin":{"id":"plate_reverb","params":{"mix":0}}}"#)).expect("dry");
    let wet = run(MP3, Some("mp3"), &recipe(r#"{"plugin":{"id":"plate_reverb","params":{"mix":100,"decay":8}}}"#)).expect("wet");
    assert!(wet.report.output.rms_db != dry.report.output.rms_db);
    assert!(run(MP3, Some("mp3"), &recipe(r#"{"plugin":{"id":"plate_reverb","params":{"nope":1}}}"#)).is_err());
    let list: serde_json::Value = serde_json::from_str(&somnia_sound::list_plugins()).unwrap();
    let plate = list.as_array().unwrap().iter().find(|p| p["id"] == "plate_reverb").unwrap();
    assert_eq!(plate["params"][0]["id"], "mix");
    assert_eq!(plate["params"][2]["taper"], "Log");
}
