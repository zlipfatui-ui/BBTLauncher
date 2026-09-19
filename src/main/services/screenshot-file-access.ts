// Keep screenshot byte access in one boundary for file-handle validation and race regression tests.
export { open, readFile } from 'node:fs/promises';
