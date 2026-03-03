import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth.js';
import leadsRouter from './routes/leads.js';
import opportunitiesRouter from './routes/opportunities.js';
import contactsRouter from './routes/contacts.js';
import quotesRouter from './routes/quotes.js';
import handoffsRouter from './routes/handoffs.js';
import policiesRouter from './routes/policies.js';
import auditRouter from './routes/audit.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// Health check must be before auth middleware so Railway's probe can reach it
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(authMiddleware);

app.use('/api/leads', leadsRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/handoffs', handoffsRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/audit', auditRouter);

app.listen(PORT, () => {
  console.log(`verticalCrm API running on http://localhost:${PORT}`);
});
