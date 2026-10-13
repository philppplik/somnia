export const dynamic = 'force-dynamic';

export default function Home() {
  const time = new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC' });
  return (
    <main>
      <p className="eyebrow">Made with Somnia</p>
      <h1>Your next idea starts here.</h1>
      <p>Edit this page in app/page.jsx and save. Your preview updates.</p>
      <p role="status" aria-live="polite">You have a working Next app. This page was made on the server at {time} UTC.</p>
    </main>
  );
}
