import type { Request, Response, NextFunction } from 'express';

export function adminGuard(req: Request, res: Response, next: NextFunction) {
  if (!req.auth.roles.includes('Admin')) {
    res.status(403).json({ error: 'Admin role required' });
    return;
  }
  next();
}
