declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module '*.css';

interface ImportMetaEnv { readonly VITE_SHARE_URL?: string; readonly VITE_ACCOUNTS?: string; readonly VITE_API_URL?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
