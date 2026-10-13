export function load() {
  return { time: new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC' }) };
}
