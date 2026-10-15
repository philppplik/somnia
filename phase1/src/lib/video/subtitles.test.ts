import test from 'node:test';
import assert from 'node:assert/strict';
import {cuesToTitleOverlays,parseSubtitles} from './subtitles';

test('SRT: cues parse with times, multi-line bodies join, tags strip',()=>{
 const srt=`1
00:00:01,000 --> 00:00:03,500
Hello <i>world</i>

2
00:00:05,250 --> 00:00:07,000
Line one
line two

`;
 const cues=parseSubtitles(srt);
 assert.equal(cues.length,2);
 assert.equal(cues[0].at,1);
 assert.equal(cues[0].duration,2.5);
 assert.equal(cues[0].text,'Hello world');
 assert.equal(cues[1].text,'Line one\nline two');
 assert.equal(cues[1].at,5.25);
});

test('VTT: header, NOTE blocks and cue settings are skipped; dot millis and missing hours work',()=>{
 const vtt=`WEBVTT - demo

NOTE this is a comment
spanning two lines

00:01.000 --> 00:03.000 align:start position:0%
First

00:04.500 --> 00:05.000
<v Speaker>Second</v>
`;
 const cues=parseSubtitles(vtt);
 assert.equal(cues.length,2);
 assert.deepEqual(cues.map(c=>c.text),['First','Second']);
 assert.equal(cues[1].at,4.5);
});

test('junk tolerance: broken cues drop, order sorts, zero-length drops',()=>{
 const cues=parseSubtitles(`not a subtitle file

00:00:02,000 --> 00:00:01,000
backwards

00:00:09,000 --> 00:00:10,000

00:00:04,000 --> 00:00:06,000
ok
`);
 assert.equal(cues.length,1);
 assert.equal(cues[0].text,'ok');
 assert.equal(parseSubtitles('').length,0);
});

test('cues become lower-third title overlays at their times',()=>{
 const ovs=cuesToTitleOverlays(parseSubtitles(`1\n00:00:01,000 --> 00:00:02,000\nHi\n`));
 assert.equal(ovs.length,1);
 assert.equal(ovs[0].kind,'title');
 assert.equal(ovs[0].at,1);
 assert.equal(ovs[0].duration,1);
 assert.equal(ovs[0].title?.text,'Hi');
});
