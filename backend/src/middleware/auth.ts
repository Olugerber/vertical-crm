import type { Request, Response, NextFunction } from 'express';

export interface AuthContext {
  organizationId: string;
  userId: string;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const organizationId = req.headers['x-org-id'];
  const userId = req.headers['x-user-id'];
  const rolesHeader = req.headers['x-user-roles'];

  if (!organizationId || !userId || typeof organizationId !== 'string' || typeof userId !== 'string') {
    res.status(401).json({ error: 'X-Org-Id and X-User-Id headers are required' });
    return;
  }

  const roles = typeof rolesHeader === 'string' && rolesHeader.trim()
    ? rolesHeader.split(',').map(r => r.trim())
    : ['AE'];

  req.auth = { organizationId, userId, roles };
  next();
}
