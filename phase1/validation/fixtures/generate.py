import struct,zlib
from pathlib import Path
# Hand-encoded PSD merged RGB fixtures, independent from parser/writer.
w,h=128,96
rgb=bytes([220]*(w*h))+bytes([45]*(w*h))+bytes([65]*(w*h))
header=b'8BPS'+struct.pack('>H6sHIIHH',1,b'\0'*6,3,h,w,8,3)
empty=struct.pack('>III',0,0,0)
base=header+empty
out=Path(__file__).parent;out.mkdir(exist_ok=True)
for name,body in [('raw',struct.pack('>H',0)+rgb),('zip',struct.pack('>H',2)+zlib.compress(rgb)),('rle',struct.pack('>H',1)+struct.pack('>H',2)*(h*3)+b'\x81\xdc'*h+b'\x81\x2d'*h+b'\x81\x41'*h)]:
 (out/f'psd-{name}.psd').write_bytes(base+body)
(out/'psd-truncated.psd').write_bytes(base+struct.pack('>H',0)+b'\x00')
(out/'psd-bomb.psd').write_bytes(base+struct.pack('>H',2)+zlib.compress(b'X'*5_000_000))
import struct,zlib
from pathlib import Path
out=Path(__file__).parent
base=(out/'psd-raw.psd').read_bytes()
for name,offset,value,fmt in [('cmyk',24,4,'H'),('16bit',22,16,'H'),('zero',18,0,'I')]:
 d=bytearray(base);struct.pack_into('>'+fmt,d,offset,value);(out/f'psd-{name}.psd').write_bytes(d)
# Resource 1057 version info declaring the merged image is only a placeholder.
r=b'8BIM'+struct.pack('>H',1057)+b'\0\0'+struct.pack('>I',4+1+4+4+4)+struct.pack('>IBIII',1,0,0,0,1)+b'\0'
(out/'psd-no-merged.psd').write_bytes(base[:30]+struct.pack('>I',len(r))+r+base[34:])
# Malformed layer section declared length out of file.
d=bytearray(base);struct.pack_into('>I',d,34,0xffffffff);(out/'psd-section-overrun.psd').write_bytes(d)
# 33 layer count caught before allocating/reading any layer records.
lm=struct.pack('>Ih',2,33)
(out/'psd-many-layers.psd').write_bytes(base[:34]+struct.pack('>I',len(lm))+lm+base[38:])
