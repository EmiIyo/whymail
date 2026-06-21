import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerPushServiceWorker } from '@/lib/push'
import { startUpdateWatcher } from '@/lib/version'

createRoot(document.getElementById("root")!).render(<App />);

// Register the push service worker early so already-subscribed devices keep
// receiving notifications. New subscriptions are created from Settings.
void registerPushServiceWorker();

// Reload to the newest deployed build on open / refocus.
startUpdateWatcher();
