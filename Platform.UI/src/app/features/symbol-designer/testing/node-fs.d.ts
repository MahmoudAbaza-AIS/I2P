// Minimal typings for the Node built-ins used by specs to read sample SVGs.
// The project does not install @types/node; Vitest runs specs in Node + jsdom.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean; size: number };
}
