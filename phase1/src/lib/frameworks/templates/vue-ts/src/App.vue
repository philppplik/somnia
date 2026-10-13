<script setup lang="ts">
import {ref} from 'vue';
const count=ref<number>(0);
</script>

<template>
  <main>
    <p class="eyebrow">Made with Somnia</p>
    <h1>Your next idea starts here.</h1>
    <p>Edit this page in src/App.vue and save. Your preview updates.</p>
    <button @click="count++">Clicked {{ count }} times</button>
    <p role="status" aria-live="polite">{{ count > 0 ? 'You have a working Vue app.' : '' }}</p>
  </main>
</template>
