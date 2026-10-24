import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function verifyArm64(platform, bytes) {
  if (platform === 'windows') {
    if (bytes.length < 64 || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('not a PE binary');
    const offset = bytes.readUInt32LE(0x3c);
    if (offset + 6 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0') throw new Error('invalid PE header');
    if (bytes.readUInt16LE(offset + 4) !== 0xaa64) throw new Error('PE machine is not ARM64');
  } else if (platform === 'linux') {
    if (bytes.length < 20 || bytes.toString('hex', 0, 4) !== '7f454c46' || bytes[4] !== 2 || bytes[5] !== 1) throw new Error('not a 64-bit little-endian ELF binary');
    if (bytes.readUInt16LE(18) !== 183) throw new Error('ELF machine is not AArch64');
  } else throw new Error(`unsupported platform ${platform}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyArm64(process.argv[2], readFileSync(process.argv[3]));
  console.log('verified native ARM64 app binary');
}
