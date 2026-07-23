import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { getPool } from './db';
import { requireApiKey } from './auth';
import {
  resolveReport,
  resolveUser,
  loadComments,
  saveComment,
  softDeleteComment,
  type Identity,
  type SaveCommentParams,
} from './queries/comments';
import { logTranscriptionUsage, loadUsageLog, type TranscriptionUsageParams } from './queries/usage-log';
import { resolveProduct } from './queries/product';

const app = express();
app.use(express.json());

// Unauthenticated -- used by Tailscale Funnel / uptime checks, no data exposed.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use(requireApiKey);

app.post('/report/resolve', async (req: Request, res: Response) => {
  try {
    const { reportId, reportName } = req.body as { reportId: string; reportName?: string };
    if (!reportId) return void res.status(400).json({ error: 'Missing reportId.' });

    const pool = await getPool();
    const reportKey = await resolveReport(pool, reportId, reportName);
    res.json({ reportKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error resolving report.' });
  }
});

app.post('/user/resolve', async (req: Request, res: Response) => {
  try {
    const identity = req.body as Identity;
    if (!identity?.clientToken) {
      return void res.status(400).json({ error: 'Missing clientToken.' });
    }

    const pool = await getPool();
    const appUserKey = await resolveUser(pool, identity);
    res.json({ appUserKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error resolving user.' });
  }
});

app.get('/product/resolve', async (req: Request, res: Response) => {
  try {
    const productId = String(req.query.productId ?? '');
    if (!productId) return void res.status(400).json({ error: 'Missing productId.' });

    const pool = await getPool();
    const product = await resolveProduct(pool, process.env.PRODUCT_DB_NAME ?? 'P26AICatalyst', productId);
    res.json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error resolving product.' });
  }
});

app.get('/comments', async (req: Request, res: Response) => {
  try {
    const reportKey = Number(req.query.reportKey);
    const productId = String(req.query.productId ?? '');
    const periodId = String(req.query.periodId ?? '');
    if (!reportKey || !productId || !periodId) {
      return void res.status(400).json({ error: 'Missing/invalid reportKey, productId or periodId.' });
    }

    const pool = await getPool();
    const comments = await loadComments(pool, reportKey, productId, periodId);
    res.json({ comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error loading comments.' });
  }
});

app.post('/comments', async (req: Request, res: Response) => {
  try {
    const params = req.body as SaveCommentParams;
    if (!params?.reportKey || !params?.productId || !params?.periodId || !params?.appUserKey || !params?.commentText) {
      return void res.status(400).json({ error: 'Missing required fields.' });
    }

    const pool = await getPool();
    const commentEntryKey = await saveComment(pool, params);
    res.status(201).json({ commentEntryKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error saving comment.' });
  }
});

app.post('/comments/soft-delete', async (req: Request, res: Response) => {
  try {
    const { commentEntryKey, requestingUserKey } = req.body as { commentEntryKey: number; requestingUserKey: number };
    if (!commentEntryKey || !requestingUserKey) {
      return void res.status(400).json({ error: 'Missing commentEntryKey or requestingUserKey.' });
    }

    const pool = await getPool();
    const deleted = await softDeleteComment(pool, commentEntryKey, requestingUserKey);
    res.json({ deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error deleting comment.' });
  }
});

app.post('/usage-log', async (req: Request, res: Response) => {
  try {
    const params = req.body as TranscriptionUsageParams;
    if (!params?.appUserKey || !params?.characters || !params?.model) {
      return void res.status(400).json({ error: 'Missing required fields.' });
    }

    const pool = await getPool();
    await logTranscriptionUsage(pool, params);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error logging usage.' });
  }
});

app.get('/usage-log', async (req: Request, res: Response) => {
  try {
    const start = req.query.start ? new Date(String(req.query.start)) : undefined;
    const end = req.query.end ? new Date(String(req.query.end)) : undefined;

    const pool = await getPool();
    const rows = await loadUsageLog(pool, { start, end });
    res.json({ rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error loading usage log.' });
  }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`pyd-cost-comments data-api listening on :${port}`);
});
