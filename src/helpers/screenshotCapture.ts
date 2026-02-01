/**
 * Screenshot Capture for Hybrid Vision + Skeleton Pipeline
 * 
 * Captures and optimizes screenshots for LLM processing:
 * - Max width: 1024px (maintains aspect ratio)
 * - Format: JPEG at 0.7 quality (~50-150KB, ~1k tokens)
 * - Perceptual hash for deduplication (skip unchanged screenshots)
 * 
 * Reference: HYBRID_VISION_SKELETON_EXTENSION_SPEC.md §1
 */

// Cache for perceptual hash to detect unchanged screenshots
let lastScreenshotHash: string | null = null;

// Configuration
const MAX_WIDTH = 1024;
const JPEG_QUALITY = 0.7;
const HASH_SIZE = 8; // 8x8 for perceptual hash

export interface ScreenshotResult {
  /** Base64-encoded JPEG (no data URL prefix) */
  base64: string;
  /** Perceptual hash for deduplication */
  hash: string;
  /** Original dimensions before resize */
  originalWidth: number;
  originalHeight: number;
  /** Final dimensions after resize */
  width: number;
  height: number;
  /** Size in bytes */
  sizeBytes: number;
}

/**
 * Capture and optimize screenshot for LLM processing.
 * 
 * @param windowId - Optional window ID (defaults to current window)
 * @param skipIfUnchanged - If true, returns null if screenshot unchanged
 * @returns Base64 JPEG string or null if unchanged
 */
export async function captureAndOptimizeScreenshot(
  windowId?: number,
  skipIfUnchanged = true
): Promise<ScreenshotResult | null> {
  try {
    // 1. Capture the visible tab at full quality
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'png',
      quality: 100,
    });

    // 2. Load image to get dimensions
    const img = await loadImage(dataUrl);

    // 3. Calculate target dimensions (max 1024px width, maintain aspect ratio)
    let width = img.width;
    let height = img.height;
    
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }

    // 4. Draw to canvas and export as optimized JPEG
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2d context');
    }
    
    // Use high-quality image smoothing for resize
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // 5. Compute perceptual hash before compression
    const hash = computeImageHash(canvas);
    
    // 6. Check if screenshot unchanged
    if (skipIfUnchanged && hash === lastScreenshotHash) {
      return null;
    }
    lastScreenshotHash = hash;

    // 7. Export as JPEG with quality 0.7
    const jpegDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    
    // 8. Extract base64 (remove "data:image/jpeg;base64," prefix)
    const base64 = jpegDataUrl.split(',')[1];
    
    // 9. Calculate size
    const sizeBytes = Math.round((base64.length * 3) / 4); // Base64 to bytes approximation

    return {
      base64,
      hash,
      originalWidth: img.width,
      originalHeight: img.height,
      width,
      height,
      sizeBytes,
    };
  } catch (error) {
    console.error('[ScreenshotCapture] Failed to capture screenshot:', error);
    throw error;
  }
}

/**
 * Capture screenshot without optimization (for debugging/comparison).
 * Returns full-resolution PNG.
 */
export async function captureRawScreenshot(windowId?: number): Promise<string> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'png',
    quality: 100,
  });
  // Return base64 without prefix
  return dataUrl.split(',')[1];
}

/**
 * Reset the screenshot hash cache.
 * Call this when starting a new task to ensure first screenshot is always captured.
 */
export function resetScreenshotHashCache(): void {
  lastScreenshotHash = null;
}

/**
 * Get the current screenshot hash (for debugging).
 */
export function getLastScreenshotHash(): string | null {
  return lastScreenshotHash;
}

/**
 * Simple perceptual hash using average color blocks.
 * Used to detect if screenshot has changed since last capture.
 * 
 * Algorithm: 
 * 1. Resize to 8x8
 * 2. Convert to grayscale
 * 3. Compare each pixel to average
 * 4. Generate 64-bit binary hash
 */
function computeImageHash(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Create small canvas for hash computation
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = HASH_SIZE;
  smallCanvas.height = HASH_SIZE;
  
  const smallCtx = smallCanvas.getContext('2d');
  if (!smallCtx) return '';

  // Resize to 8x8
  smallCtx.drawImage(canvas, 0, 0, HASH_SIZE, HASH_SIZE);
  const imageData = smallCtx.getImageData(0, 0, HASH_SIZE, HASH_SIZE);

  // Convert to grayscale and compute average
  const pixels: number[] = [];
  let sum = 0;
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    // Grayscale using luminosity method
    const gray = 0.299 * imageData.data[i] + 
                 0.587 * imageData.data[i + 1] + 
                 0.114 * imageData.data[i + 2];
    pixels.push(gray);
    sum += gray;
  }
  
  const avg = sum / pixels.length;

  // Generate hash: 1 if pixel > average, 0 otherwise
  return pixels.map(p => (p > avg ? '1' : '0')).join('');
}

/**
 * Load an image from a data URL.
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = dataUrl;
  });
}

/**
 * Calculate Hamming distance between two hashes.
 * Lower = more similar. 0 = identical.
 */
export function hashDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return Infinity;
  
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

/**
 * Check if two hashes are similar enough to be considered "same" screenshot.
 * Threshold of 10 allows for minor rendering differences (scrollbars, etc.)
 */
export function areHashesSimilar(hash1: string, hash2: string, threshold = 10): boolean {
  return hashDistance(hash1, hash2) <= threshold;
}
