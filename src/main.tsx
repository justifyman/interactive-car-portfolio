import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import './styles/app.css';
import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { urlParams } from './game/store';

const App = lazy(() => import('./App'));
const Gallery = lazy(() => import('./dev/Gallery'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{urlParams.has('gallery') ? <Gallery /> : <App />}</Suspense>
  </StrictMode>,
);
