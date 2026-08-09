import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceApp } from './WorkspaceApp';
import { PrototypeV2 } from './PrototypeV2';
import './styles.css';
import './workspace.css';
import './prototype-v2.css';

const application = window.location.pathname === '/advanced' ? <WorkspaceApp /> : <PrototypeV2 />;

createRoot(document.getElementById('root')!).render(<StrictMode>{application}</StrictMode>);
