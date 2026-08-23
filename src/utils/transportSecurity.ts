export function isInsecureHttpUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'http:';
  } catch {
    return /^http:\/\//i.test(value.trim());
  }
}

export function assertInsecureHttpAllowed(urls: Array<string | undefined>, allowed: boolean): void {
  if (!allowed && urls.some((url) => url && isInsecureHttpUrl(url))) {
    throw new Error('HTTP is not encrypted. Enable the insecure HTTP exception for this source to continue.');
  }
}

