/** Coordinate folder changes with downloads, launches and content edits. */
export function createRuntimeOperations() {
  let active = 0;
  let changing = false;
  return {
    assertIdle() {
      if (changing || active) throw new Error('Wait for the current download or game operation to finish.');
    },
    async run<T>(work: () => Promise<T>): Promise<T> {
      if (changing) throw new Error('Game folder is being copied. Please wait until Save finishes.');
      if (active) throw new Error('Wait for the current download or game operation to finish.');
      active += 1;
      try { return await work(); } finally { active -= 1; }
    },
    async changeDirectory<T>(work: () => Promise<T>): Promise<T> {
      if (changing || active) throw new Error('Wait for the current download or game operation before changing folders.');
      changing = true;
      try { return await work(); } finally { changing = false; }
    }
  };
}
