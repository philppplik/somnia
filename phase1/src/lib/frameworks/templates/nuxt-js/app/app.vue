<script setup>
import './assets/style.css';
useHead({ htmlAttrs: { lang: 'en' }, title: '{{name}}' });
// useState carries the server's value to the browser, so both render the same text.
const time = useState('time', () => new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC' }));
</script>

<template>
  <main>
    <p class="eyebrow">Made with Somnia</p>
    <h1>Your next idea starts here.</h1>
    <p>Edit this page in app/app.vue and save. Your preview updates.</p>
    <p role="status" aria-live="polite">You have a working Nuxt app. This page was made on the server at {{ time }} UTC.</p>
  </main>
</template>
