import express, { type Request, type Response } from "express";

const router = express.Router();

// Login & Logout endpoints
router.post('/login', (req: Request, res: Response) => {
  const username = String((req.body as any)?.username || '');
  const password = String((req.body as any)?.password || '');
  const envUser = process.env.MAIN_USERNAME || '';
  const envPass = process.env.MAIN_PASSWORD || '';
  if (username === envUser && password === envPass) {
    res.setHeader('Set-Cookie', 'auth=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800');
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'invalid_credentials' });
});

router.post('/logout', (req: Request, res: Response) => {
  res.setHeader('Set-Cookie', 'auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

export default router;