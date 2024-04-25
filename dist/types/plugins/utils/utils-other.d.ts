export declare function runXTimes(xTimes: number, fn: (idx: number) => void): void;
export declare function ensureNotFalsy<T>(obj: T | false | undefined | null, message?: string): T;
export declare function ensureInteger(obj: unknown): number;
/**
 * Using shareReplay() without settings will not unsubscribe
 * if there are no more subscribers.
 * So we use these defaults.
 * @link https://cartant.medium.com/rxjs-whats-changed-with-sharereplay-65c098843e95
 */
export declare const RXJS_SHARE_REPLAY_DEFAULTS: {
    bufferSize: number;
    refCount: boolean;
};
