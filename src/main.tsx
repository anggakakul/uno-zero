import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import UnoGameHubApp from './hub/UnoGameHubApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UnoGameHubApp />
  </StrictMode>
);
