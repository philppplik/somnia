<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>{{name}}</title></svelte:head>

<main>
  <p class="eyebrow">Made with Somnia</p>
  <h1>Your next idea starts here.</h1>
  <p>Edit this page in src/routes/+page.svelte and save. Your preview updates.</p>
  <p role="status" aria-live="polite">You have a working SvelteKit app. This page was made on the server at {data.time} UTC.</p>
</main>
