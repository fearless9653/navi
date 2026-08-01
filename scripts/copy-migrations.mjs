import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('src/db/migrations');
const target = resolve('dist/server/migrations');

mkdirSync(resolve('dist/server'), { recursive: true });
cpSync(source, target, { recursive: true });
