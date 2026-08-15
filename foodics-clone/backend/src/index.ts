import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import routes from './routes';
import { errorHandler, notFound } from './middleware/error';

dotenv.config();

// Set the process timezone BEFORE anything else uses Date.
process.env.TZ = process.env.TZ || 'Africa/Cairo';

const app = express();
const PORT = parseInt(process.env.PORT || '4000');

// T-C: CORS allowlist. In dev, allow all (so the Next.js frontend on any port works).
// In prod, set CORS_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
// and the server will reject any other origin.
const corsOrigins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
const corsOptions = corsOrigins.length === 1 && corsOrigins[0] === '*'
  ? { origin: '*', credentials: true }
  : { origin: (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
      if (!origin) return cb(null, true); // same-origin / curl
      if (corsOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    }, credentials: true };
app.use(helmet());
app.use(cors(corsOptions));
// Keep the raw body available for HMAC verification (used by the aggregator
// webhook). Without the `verify` callback, JSON re-serialization can break
// signature checks because of whitespace differences.
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

// P2.5: stricter rate limit on login (5 wrong attempts / min per IP)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'محاولات دخول كثيرة — حاول بعد دقيقة' },
});
app.use('/api/auth/login', loginLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'foodics-clone-api', timestamp: new Date().toISOString() });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

// T-G: graceful shutdown. On SIGINT/SIGTERM, stop accepting new requests,
// let in-flight ones finish (up to 10s), then exit. Without this, a kill
// mid-transaction leaves the DB in a half-updated state and the next
// process start hits "database is locked".
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Foodics API running on http://0.0.0.0:${PORT}`);
  console.log(`   Health: http://0.0.0.0:${PORT}/health`);
  console.log(`   API base: http://0.0.0.0:${PORT}/api`);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — draining in-flight requests (max 10s)...`);
  server.close((err) => {
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    console.log('✅ Server closed cleanly');
    process.exit(0);
  });
  // Hard-kill if we take too long
  setTimeout(() => {
    console.error('⏰ Shutdown timeout — forcing exit');
    process.exit(1);
  }, 10000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
