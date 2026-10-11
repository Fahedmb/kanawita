import {
  AuthorizedIpDevice,
  DeviceKind,
  KANAWITA_SECURITY_PASSWORD,
} from './models';

export interface ParsedDeviceMetadata {
  deviceName: string;
  os: string;
  browser: string;
  deviceType: DeviceKind;
}

/**
 * Verifies whether the user-entered security password matches `61854`.
 */
export const verifySecurityPassword = (
  candidate: string | null | undefined
): boolean => {
  if (typeof candidate !== 'string') return false;
  return candidate.trim() === KANAWITA_SECURITY_PASSWORD;
};

/**
 * Normalizes IPv4, IPv6, localhost (`::1`), IPv4-mapped IPv6 (`::ffff:`),
 * and comma-separated `x-forwarded-for` lists into a canonical IP string.
 */
export const normalizeIpAddress = (
  rawIp: string | null | undefined
): string => {
  if (!rawIp || typeof rawIp !== 'string') {
    return '127.0.0.1';
  }

  // Extract first IP if comma-separated (x-forwarded-for)
  let cleaned = rawIp.split(',')[0]?.trim() || '';
  if (!cleaned) {
    return '127.0.0.1';
  }

  // Unwrap bracketed IPv6 such as [::1]:3000 or [2001:db8::1]:8080
  const bracketMatch = /^\[([^\]]+)\](?::\d+)?$/.exec(cleaned);
  if (bracketMatch) {
    cleaned = bracketMatch[1].trim();
  }

  let lower = cleaned.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    cleaned = cleaned.slice(7);
    lower = cleaned.toLowerCase();
  }

  // Strip port from IPv4:port (e.g. 197.26.18.42:54321 or 127.0.0.1:3000)
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(cleaned)) {
    cleaned = cleaned.split(':')[0];
    lower = cleaned.toLowerCase();
  }

  if (
    lower === '::1' ||
    lower === '0:0:0:0:0:0:0:1' ||
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower.startsWith('localhost:')
  ) {
    return '127.0.0.1';
  }

  // Convert deterministic IPv4 document IDs (e.g. ip_197_26_18_42) back to dotted IPv4
  if (/^ip_\d{1,3}(_\d{1,3}){3}$/i.test(cleaned)) {
    return cleaned.slice(3).replace(/_/g, '.');
  }

  // Canonicalize IPv6 hex digits to lowercase
  if (cleaned.includes(':')) {
    return lower;
  }

  return cleaned;
};

/**
 * Converts a normalized IP address into a deterministic document ID for IndexedDB & MongoDB.
 */
export const ipToDocumentId = (ip: string): string => {
  const trimmed = (ip || '').trim();
  if (
    trimmed.startsWith('ip_') &&
    !/^ip_\d{1,3}(_\d{1,3}){3}$/i.test(trimmed) &&
    /^ip_[a-zA-Z0-9_]+$/.test(trimmed)
  ) {
    return trimmed;
  }
  const normalized = normalizeIpAddress(trimmed);
  const safe = normalized.replace(/[^a-zA-Z0-9]/g, '_');
  return `ip_${safe}`;
};

/**
 * Parses a User-Agent string into human-readable device name, OS, browser, and deviceType.
 */
export const parseDeviceFromUserAgent = (
  userAgent: string | null | undefined
): ParsedDeviceMetadata => {
  const ua = (userAgent || '').trim();
  if (!ua) {
    return {
      deviceName: 'Desktop • Web Browser',
      os: 'Desktop OS',
      browser: 'Browser',
      deviceType: 'desktop',
    };
  }

  // Detect Browser
  let browser = 'Browser';
  if (/Edg\/|EdgiOS|EdgA/i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/CriOS/i.test(ua)) {
    browser = 'Mobile Chrome';
  } else if (/FxiOS/i.test(ua)) {
    browser = 'Mobile Firefox';
  } else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    browser = /Mobile/i.test(ua) ? 'Mobile Chrome' : 'Chrome';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = /Mobile|iPhone|iPad|iPod/i.test(ua) ? 'Mobile Safari' : 'Safari';
  }

  // Detect OS & Device Model
  let os = 'Desktop OS';
  let deviceModel = 'Desktop';
  let deviceType: DeviceKind = 'desktop';

  if (/iPad/i.test(ua)) {
    os = 'iPadOS';
    deviceModel = 'iPad';
    deviceType = 'tablet';
  } else if (/iPhone|iPod/i.test(ua)) {
    os = 'iOS';
    deviceModel = 'iPhone';
    deviceType = 'mobile';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    const isTablet = !/Mobile/i.test(ua);
    deviceModel = isTablet ? 'Android Tablet' : 'Android Phone';
    deviceType = isTablet ? 'tablet' : 'mobile';
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows';
    deviceModel = 'Windows PC';
    deviceType = 'desktop';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    deviceModel = 'Mac';
    deviceType = 'desktop';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    deviceModel = 'Linux PC';
    deviceType = 'desktop';
  }

  return {
    deviceName: `${deviceModel} • ${browser}`,
    os,
    browser,
    deviceType,
  };
};

/**
 * Checks whether `currentIp` is present and marked `recognized` in the list of authorized IPs.
 */
export const isIpAuthorized = (
  currentIp: string | null | undefined,
  authorizedIps: AuthorizedIpDevice[]
): boolean => {
  if (!currentIp) return false;
  const target = normalizeIpAddress(currentIp);
  return authorizedIps.some(
    (entry) =>
      entry &&
      entry.recognized !== false &&
      normalizeIpAddress(entry.ip) === target
  );
};

/**
 * Appends a numeric digit to the security PIN input string (max 8 digits).
 */
export const appendSecurityPinKey = (current: string, key: string): string => {
  if (!/^\d$/.test(key)) return current;
  if (current.length >= 8) return current;
  return `${current}${key}`;
};

/**
 * Removes the last digit from the security PIN input string.
 */
export const backspaceSecurityPin = (current: string): string => {
  if (!current || current.length <= 1) return '';
  return current.slice(0, -1);
};
