/**
 * Domain Utilities for Domain-Aware Sessions
 * 
 * Provides utilities for extracting, normalizing, and working with domains
 * to support domain-aware session management.
 * 
 * Reference: Domain-Aware Sessions Feature
 */

/**
 * Domain information extracted from a URL
 */
export interface DomainInfo {
  /** Full hostname (e.g., "www.google.com") */
  hostname: string;
  /** Root domain without subdomain (e.g., "google.com") */
  rootDomain: string;
  /** Protocol (e.g., "https:") */
  protocol: string;
  /** Full origin (e.g., "https://www.google.com") */
  origin: string;
  /** Whether this is a valid web URL (http/https) */
  isValid: boolean;
}

/**
 * Extract domain information from a URL
 * 
 * @param url - The URL to extract domain from
 * @returns DomainInfo object with extracted domain details
 * 
 * @example
 * extractDomain('https://www.google.com/search?q=test')
 * // Returns: { hostname: 'www.google.com', rootDomain: 'google.com', ... }
 */
export function extractDomain(url: string): DomainInfo {
  const invalidResult: DomainInfo = {
    hostname: '',
    rootDomain: '',
    protocol: '',
    origin: '',
    isValid: false,
  };

  if (!url || typeof url !== 'string') {
    return invalidResult;
  }

  try {
    const urlObj = new URL(url);
    
    // Only support http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return invalidResult;
    }

    const hostname = urlObj.hostname.toLowerCase();
    const rootDomain = getRootDomain(hostname);

    return {
      hostname,
      rootDomain,
      protocol: urlObj.protocol,
      origin: urlObj.origin,
      isValid: true,
    };
  } catch {
    return invalidResult;
  }
}

/**
 * Get the root domain from a hostname (removes subdomains)
 * 
 * @param hostname - Full hostname (e.g., "www.mail.google.com")
 * @returns Root domain (e.g., "google.com")
 * 
 * @example
 * getRootDomain('www.mail.google.com') // 'google.com'
 * getRootDomain('localhost') // 'localhost'
 * getRootDomain('192.168.1.1') // '192.168.1.1'
 */
export function getRootDomain(hostname: string): string {
  if (!hostname) return '';

  // Handle IP addresses (don't try to extract domain)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return hostname;
  }

  // Handle localhost
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return 'localhost';
  }

  const parts = hostname.split('.');
  
  // Single part (e.g., "localhost")
  if (parts.length === 1) {
    return hostname;
  }

  // Two parts (e.g., "google.com")
  if (parts.length === 2) {
    return hostname;
  }

  // Handle common multi-part TLDs (e.g., "co.uk", "com.au")
  const multiPartTLDs = [
    'co.uk', 'co.nz', 'co.za', 'co.in', 'co.jp', 'co.kr',
    'com.au', 'com.br', 'com.mx', 'com.sg', 'com.hk', 'com.tw',
    'org.uk', 'org.au', 'net.au', 'gov.uk', 'ac.uk', 'edu.au',
  ];

  const lastTwo = parts.slice(-2).join('.');
  if (multiPartTLDs.includes(lastTwo)) {
    // Return last 3 parts (e.g., "example.co.uk")
    return parts.slice(-3).join('.');
  }

  // Default: return last 2 parts (e.g., "google.com" from "www.google.com")
  return parts.slice(-2).join('.');
}

/**
 * Check if two URLs belong to the same domain
 * 
 * @param url1 - First URL
 * @param url2 - Second URL
 * @returns true if both URLs have the same root domain
 */
export function isSameDomain(url1: string, url2: string): boolean {
  const domain1 = extractDomain(url1);
  const domain2 = extractDomain(url2);

  if (!domain1.isValid || !domain2.isValid) {
    return false;
  }

  return domain1.rootDomain === domain2.rootDomain;
}

/**
 * Format a session title with domain prefix
 * 
 * @param domain - The root domain (e.g., "google.com")
 * @param taskDescription - Description of the task (can be empty for new sessions)
 * @param maxLength - Maximum total length of the title (default: 60)
 * @returns Formatted title (e.g., "google.com: Search for flights")
 */
export function formatSessionTitle(
  domain: string,
  taskDescription: string,
  maxLength: number = 60
): string {
  if (!domain) {
    return taskDescription || 'New Task';
  }

  const prefix = `${domain}: `;
  const prefixLength = prefix.length;

  if (!taskDescription || !taskDescription.trim()) {
    return `${domain}: New Task`;
  }

  const cleanDescription = taskDescription.trim();
  
  // If description fits within limit, return full title
  if (prefixLength + cleanDescription.length <= maxLength) {
    return `${prefix}${cleanDescription}`;
  }

  // Truncate description to fit
  const availableLength = maxLength - prefixLength - 3; // -3 for "..."
  if (availableLength <= 0) {
    return `${domain.substring(0, maxLength - 3)}...`;
  }

  return `${prefix}${cleanDescription.substring(0, availableLength)}...`;
}

/**
 * Extract task description from a session title (strips domain prefix)
 * 
 * @param title - Full session title (e.g., "google.com: Search for flights")
 * @returns Task description without domain prefix
 */
export function extractTaskDescription(title: string): string {
  if (!title) return '';

  // Look for domain prefix pattern (domain.tld: description)
  const colonIndex = title.indexOf(': ');
  if (colonIndex === -1) {
    return title;
  }

  const potentialDomain = title.substring(0, colonIndex);
  
  // Check if it looks like a domain (contains a dot or is localhost)
  if (potentialDomain.includes('.') || potentialDomain === 'localhost') {
    return title.substring(colonIndex + 2);
  }

  return title;
}

/**
 * Extract domain from a session title
 * 
 * @param title - Full session title (e.g., "google.com: Search for flights")
 * @returns Domain or null if not found
 */
export function extractDomainFromTitle(title: string): string | null {
  if (!title) return null;

  const colonIndex = title.indexOf(': ');
  if (colonIndex === -1) {
    return null;
  }

  const potentialDomain = title.substring(0, colonIndex);
  
  // Check if it looks like a domain
  if (potentialDomain.includes('.') || potentialDomain === 'localhost') {
    return potentialDomain;
  }

  return null;
}

/**
 * Normalize a URL for comparison (removes trailing slashes, normalizes protocol)
 * 
 * @param url - URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';

  try {
    const urlObj = new URL(url);
    // Remove trailing slash from pathname
    let pathname = urlObj.pathname;
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    return `${urlObj.protocol}//${urlObj.hostname}${pathname}${urlObj.search}`;
  } catch {
    return url;
  }
}
