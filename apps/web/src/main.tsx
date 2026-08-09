import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceApp } from './WorkspaceApp';
import './styles.css';
import './workspace.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceApp />
  </StrictMode>
);
