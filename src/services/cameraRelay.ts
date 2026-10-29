export function normalizeRelayUrl(value: string): string {
  if (!value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return '';
    const octets = url.hostname.split('.').map(Number);
    const isPrivateIpv4 = octets.length === 4 && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255) && (
      octets[0] === 10 || octets[0] === 127 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    );
    const isLocalHttp = url.protocol === 'http:' && (['localhost', '127.0.0.1'].includes(url.hostname) || isPrivateIpv4);
    if (!isLocalHttp) return '';
    return url.origin;
  } catch { return ''; }
}
