import type { Request, Response, NextFunction } from "express";

export function parseCookies(cookieHeader?: string) {
  const map: Record<string, string> = {};
  if (!cookieHeader) return map;
  cookieHeader.split(';').forEach(part => {
    const [k, v] = part.trim().split('=');
    if (k) map[k] = decodeURIComponent(v || '');
  });
  return map;
}

export function isAuthenticated(req: Request) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.auth === '1';
}

// Auth gate middleware: allow login routes and login.html, gate others
export function authGate(req: Request, res: Response, next: NextFunction) {
  const allowPaths = ['/login', '/logout', '/login.html'];
  if (allowPaths.includes(req.path)) return next();
  if (isAuthenticated(req)) return next();
  // redirect to login page for non-API GET
  if (req.method === 'GET') return res.redirect('/login.html');
  return res.status(401).json({ error: 'unauthorized' });
}