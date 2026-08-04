import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('src/outlook/outlook-draft.ps1');
const destination = resolve('dist/outlook/outlook-draft.ps1');
await mkdir(dirname(destination), { recursive: true });
await cp(source, destination);
