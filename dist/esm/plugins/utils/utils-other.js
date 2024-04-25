export function runXTimes(xTimes, fn) {
  new Array(xTimes).fill(0).forEach((_v, idx) => fn(idx));
}
export function ensureNotFalsy(obj, message) {
  if (!obj) {
    if (!message) {
      message = '';
    }
    throw new Error('ensureNotFalsy() is falsy: ' + message);
  }
  return obj;
}
export function ensureInteger(obj) {
  if (!Number.isInteger(obj)) {
    throw new Error('ensureInteger() is falsy');
  }
  return obj;
}

/**
 * Using shareReplay() without settings will not unsubscribe
 * if there are no more subscribers.
 * So we use these defaults.
 * @link https://cartant.medium.com/rxjs-whats-changed-with-sharereplay-65c098843e95
 */
export var RXJS_SHARE_REPLAY_DEFAULTS = {
  bufferSize: 1,
  refCount: true
};
//# sourceMappingURL=utils-other.js.map