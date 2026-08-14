import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrototypeV2 } from './PrototypeV2';
import './prototype-v2.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrototypeV2 />
  </StrictMode>
);
