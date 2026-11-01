export function createRefreshGate(work: () => Promise<unknown>, isVisible?: () => boolean): () => Promise<void>;
