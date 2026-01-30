/**
 * Payload Size Validation
 * 
 * CRITICAL FIX: Payload Explosion (Issue #2)
 * Enforces a hard cap on the DOM payload size before sending to backend.
 * Prevents 413 Payload Too Large errors from API gateways.
 * 
 * Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #2 (Payload Explosion)
 */

/**
 * Maximum DOM payload size (4MB)
 * 
 * Vercel limit: 4.5MB
 * Safety margin: 0.5MB (for headers, other fields)
 * Target max DOM: 4.0MB
 */
export const MAX_DOM_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

/**
 * Warning threshold (3MB) - log a warning when payload approaches limit
 */
export const WARNING_DOM_SIZE_BYTES = 3 * 1024 * 1024; // 3MB

/**
 * Custom error class for payload too large errors
 */
export class PayloadTooLargeError extends Error {
  public readonly actualSize: number;
  public readonly maxSize: number;

  constructor(message: string, actualSize: number, maxSize: number = MAX_DOM_SIZE_BYTES) {
    super(message);
    this.name = 'PayloadTooLargeError';
    this.actualSize = actualSize;
    this.maxSize = maxSize;
  }
}

/**
 * User-friendly error message for payload too large
 */
export const PAYLOAD_TOO_LARGE_MESSAGE = 
  'Page content too large for processing. ' +
  'Try: (1) Refreshing the page, (2) Closing modals/popups, ' +
  '(3) Navigating to a simpler section of the site.';

/**
 * Validate DOM payload size before sending to backend.
 * Throws PayloadTooLargeError if payload exceeds MAX_DOM_SIZE_BYTES.
 * 
 * @param dom - The DOM string to validate
 * @throws PayloadTooLargeError if payload is too large
 */
export function validatePayloadSize(dom: string): void {
  // Get byte size (UTF-8 encoding can be larger than string length)
  const byteSize = new TextEncoder().encode(dom).length;
  
  // Log warning if approaching limit
  if (byteSize > WARNING_DOM_SIZE_BYTES) {
    const sizeMB = (byteSize / (1024 * 1024)).toFixed(2);
    console.warn(`[PayloadValidation] DOM size approaching limit: ${sizeMB}MB`);
  }
  
  // Throw error if exceeds limit
  if (byteSize > MAX_DOM_SIZE_BYTES) {
    const sizeMB = (byteSize / (1024 * 1024)).toFixed(2);
    const maxMB = (MAX_DOM_SIZE_BYTES / (1024 * 1024)).toFixed(1);
    console.error(`[PayloadValidation] DOM size exceeds limit: ${sizeMB}MB > ${maxMB}MB`);
    throw new PayloadTooLargeError(
      PAYLOAD_TOO_LARGE_MESSAGE,
      byteSize,
      MAX_DOM_SIZE_BYTES
    );
  }
  
  // Log size for monitoring
  const sizeMB = (byteSize / (1024 * 1024)).toFixed(2);
  console.debug(`[PayloadValidation] DOM size: ${sizeMB}MB (limit: 4MB)`);
}

/**
 * Get a human-readable size string
 * 
 * @param bytes - Size in bytes
 * @returns Human-readable size string (e.g., "2.5 MB")
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * Calculate the byte size of a string (UTF-8 encoding)
 * 
 * @param str - The string to measure
 * @returns Size in bytes
 */
export function getStringByteSize(str: string): number {
  return new TextEncoder().encode(str).length;
}
