import { Request } from 'express';

function isInternalIp(ip: string): boolean {
  const internalRegex =
    /^(10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.|::1|fe80:)/i;
  return internalRegex.test(ip);
}

export function getClientPublicIp(req: Request): string | null {
  let ip = req.headers['x-real-ip'] as string;

  if (!ip) {
    const xForwardedFor = req.headers['x-forwarded-for'] as string;
    if (xForwardedFor) {
      ip = xForwardedFor.split(',')[0].trim(); // 多个IP时取第一个
    }
  }

  if (!ip) {
    ip = req.ip as string;
  }

  if (ip && !isInternalIp(ip)) {
    if (ip.startsWith('::ffff:')) {
      ip = ip.slice(7);
    }
    return ip;
  }

  return '';
}
