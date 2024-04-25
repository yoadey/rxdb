import type { RxCleanupPolicy, RxState } from '../../types/index.d.ts';
export declare function startCleanupForRxState(state: RxState<unknown, unknown>): Promise<void>;
/**
 * Runs the cleanup for a single RxState
 */
export declare function cleanupRxState(state: RxState<unknown, unknown>, cleanupPolicy: RxCleanupPolicy): Promise<void>;
/**
 * TODO this is not waiting for writes!
 * it just runs on interval.
 */
export declare function runCleanupAfterWrite(state: RxState<unknown, unknown>, cleanupPolicy: RxCleanupPolicy): Promise<void>;
