import test from 'node:test';
import assert from 'node:assert/strict';
import {cuesToTitleOverlays,decodeSubtitleBytes,parseSubtitles} from './subtitles';

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

test('SRT styling: font colour wins once, bold/italic are cue-wide',()=>{
 const cues=parseSubtitles(`1
00:00:01,000 --> 00:00:02,000
<font color="#ff0000">Red</font> <b>bold</b> <i>italic</i> <font color="blue">ignored</font>
`);
 assert.equal(cues[0].color,'#ff0000');
 assert.equal(cues[0].bold,true);
 assert.equal(cues[0].italic,true);
 assert.equal(cues[0].text,'Red bold italic ignored');
 const ovs=cuesToTitleOverlays(cues);
 assert.equal(ovs[0].title?.color,'#ff0000');
 assert.equal(ovs[0].title?.bold,true);
});

test('VTT cue settings: align maps, position/line recentre the rect inside the frame',()=>{
 const cues=parseSubtitles(`WEBVTT

00:01.000 --> 00:02.000 align:end position:80% line:10%
Top right
`);
 assert.equal(cues[0].align,'right');
 assert.ok(cues[0].rect&&cues[0].rect.x>0.3&&cues[0].rect.y<0.05,JSON.stringify(cues[0].rect));
});

test('ASS basics: dialogue times (centiseconds), override tags, BGR colour, \\N breaks',()=>{
 const ass=`[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\b1\\c&H0000FF&}Red bold
Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,{\\an7\\pos(200,100)}top left\\Nsecond line
Comment: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,not a dialogue
`;
 const cues=parseSubtitles(ass);
 assert.equal(cues.length,2);
 assert.equal(cues[0].at,1);
 assert.equal(cues[0].duration,2.5);
 assert.equal(cues[0].color,'#ff0000','ASS stores BGR, the spec wants RGB');
 assert.equal(cues[0].bold,true);
 assert.equal(cues[1].vAlign,'top');
 assert.equal(cues[1].align,'left');
 assert.equal(cues[1].text,'top left\nsecond line');
 assert.ok(cues[1].rect&&cues[1].rect.y<0.05);
});

test('encoding: strict UTF-8 first, Latin-1 fallback for legacy files',()=>{
 const utf8=new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\nGrüße\n');
 assert.ok(decodeSubtitleBytes(utf8).includes('Grüße'));
 const latin1=Uint8Array.from([0x47,0x72,0xfc,0xdf,0x65]); // "Grüße" in ISO-8859-1 (invalid UTF-8)
 assert.equal(decodeSubtitleBytes(latin1),'Grüße');
 // The WHATWG 'iso-8859-1' label maps to the windows-1252 decoder: C1 bytes are typography, not controls.
 const win1252=decodeSubtitleBytes(Uint8Array.from([0x93,0x48,0x61,0x6c,0x6c,0x6f,0x94,0x20,0x38,0x30,0x80]));
 assert.equal(win1252,'\u201cHallo\u201d 80\u20ac','smart quotes and the euro sign survive');
});
