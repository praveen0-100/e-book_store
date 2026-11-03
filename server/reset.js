import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
fs.rmSync(dir, { recursive: true, force: true });
console.log('Database and uploads removed. Restart the server to start fresh.');
