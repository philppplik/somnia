import {createSignal} from 'solid-js';
export default function App() {
  const [count, setCount] = createSignal(0);
  return (
    <main>
      <p class="eyebrow">Made with Somnia</p>
      <h1>Your next idea starts here.</h1>
      <p>Edit this page in src/App.tsx and save. Your preview updates.</p>
      <button onClick={() => setCount(n => n + 1)}>Clicked {count()} times</button>
      <p role="status" aria-live="polite">{count() > 0 ? 'You have a working Solid app.' : ''}</p>
    </main>
  );
}
