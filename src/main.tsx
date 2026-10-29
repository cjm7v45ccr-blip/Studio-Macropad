import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

registerSW({
  immediate: true,
  onNeedReload: import.meta.env.DEV ? () => {} : undefined,
  onRegisterError() {
    // Ignore service worker registration restrictions in sandboxed preview iframes
  },
});

createRoot(document.getElementById('root')!).render(<App />);
