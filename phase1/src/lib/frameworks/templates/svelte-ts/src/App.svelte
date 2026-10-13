<script lang="ts">
  let count = $state(0);
</script>

<main>
  <p class="eyebrow">Made with Somnia</p>
  <h1>Your next idea starts here.</h1>
  <p>Edit this page in src/App.svelte and save. Your preview updates.</p>
  <button onclick={() => count++}>Clicked {count} times</button>
  <p role="status" aria-live="polite">{count > 0 ? 'You have a working Svelte app.' : ''}</p>
</main>
