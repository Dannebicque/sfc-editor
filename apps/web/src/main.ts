import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@grafcet/editor/styles.css';
import { mountEditor } from '@grafcet/editor';

mountEditor('#app');

// Hors ligne : service worker enregistré uniquement en production (jamais en développement).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* hors ligne non disponible */ }); });
}
