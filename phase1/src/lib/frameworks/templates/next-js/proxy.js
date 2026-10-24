import { NextResponse } from 'next/server';
import { somniaPreviewGate, somniaPreviewHeaders } from './somnia-preview.mjs';

// Runs only while Somnia previews the app: without a preview token it lets every request through.
export function proxy(request) {
  const blocked = somniaPreviewGate(request);
  if (blocked) return blocked;
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(somniaPreviewHeaders())) response.headers.set(name, value);
  return response;
}
