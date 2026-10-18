// Shared with Workbox, which tests pathname + search (not pathname alone).
// Dotted path segments are reserved for files; dots in query values are allowed.
export const nonSpaPath = /^\/(?:(?:api|assets)(?:\/|\?|$)|[^?]*(?:\.|%2e))/i;
