import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://studio:studio_pass@localhost:5432/marketing_studio',
});

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sent_log (
      id SERIAL PRIMARY KEY,
      product_id TEXT,
      product_name TEXT,
      sent_date TEXT,
      subject TEXT,
      body TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      link TEXT DEFAULT '#',
      priority TEXT DEFAULT 'MEDIUM',
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS arts (
      id TEXT PRIMARY KEY,
      collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      description TEXT,
      last_used BIGINT
    );

    CREATE TABLE IF NOT EXISTS schedule_slots (
      id TEXT PRIMARY KEY,
      time TEXT NOT NULL,
      is_prime BOOLEAN DEFAULT FALSE,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS instagram_queue (
      id SERIAL PRIMARY KEY,
      image_url TEXT NOT NULL,
      link_url TEXT NOT NULL,
      link_sticker_x FLOAT DEFAULT 0.5,
      link_sticker_y FLOAT DEFAULT 0.85,
      caption TEXT,
      scheduled_at BIGINT NOT NULL,
      status TEXT DEFAULT 'pending',
      ig_post_id TEXT,
      error TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Seed default user if none exists
  const { rows } = await pool.query('SELECT id FROM users LIMIT 1');
  if (rows.length === 0) {
    const email = process.env.DEFAULT_USER_EMAIL || 'admin@example.com';
    const password = process.env.DEFAULT_USER_PASSWORD || 'changeme';
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, hash]);
    console.log(`Default user created: ${email}`);
  }

  console.log('Database initialized');
}

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    jwt.verify(authHeader.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

async function startServer() {
  await initDB();

  const app = express();
  const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;

  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(uploadsDir));

  // ── Auth (sem proteção) ────────────────────────────────────────────
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: 'Email e senha obrigatórios' }); return; }
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }
    const token = jwt.sign({ userId: rows[0].id, email: rows[0].email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, email: rows[0].email });
  });

  // ── Middleware de auth para todas as rotas /api abaixo ─────────────
  app.use('/api', authMiddleware);

  // ── E-mail: Sent Log ──────────────────────────────────────────────
  app.get('/api/log', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM sent_log ORDER BY sent_date DESC');
    res.json(rows);
  });

  app.post('/api/log', async (req, res) => {
    const { product_id, product_name, sent_date, subject, body } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO sent_log (product_id, product_name, sent_date, subject, body) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [product_id, product_name, sent_date, subject, body]
    );
    res.json({ id: rows[0].id });
  });

  app.delete('/api/log/:id', async (req, res) => {
    await pool.query('DELETE FROM sent_log WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  });

  // ── Settings ───────────────────────────────────────────────────────
  app.get('/api/settings/:key', async (req, res) => {
    const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [req.params.key]);
    res.json({ value: rows[0]?.value ?? null });
  });

  app.post('/api/settings', async (req, res) => {
    const { key, value } = req.body;
    if (!key || !value) return res.status(400).json({ error: 'Missing key or value' });
    await pool.query('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
    res.json({ success: true });
  });

  // ── CORS Proxy (XML Feed) ─────────────────────────────────────────
  app.get('/api/proxy-feed', async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: 'Missing URL' });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed: ${response.statusText}`);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('image')) {
        const buffer = await response.arrayBuffer();
        res.set('Content-Type', contentType);
        res.send(Buffer.from(buffer));
      } else {
        res.send(await response.text());
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Agenda: Collections ───────────────────────────────────────────
  app.get('/api/collections', async (_req, res) => {
    const { rows: cols } = await pool.query('SELECT * FROM collections ORDER BY created_at ASC');
    const { rows: arts } = await pool.query('SELECT * FROM arts ORDER BY id ASC');
    const result = cols.map(col => ({
      ...col,
      arts: arts.filter(a => a.collection_id === col.id).map(a => ({
        id: a.id,
        collectionId: a.collection_id,
        imageUrl: a.image_url,
        description: a.description,
        lastUsed: a.last_used ? Number(a.last_used) : null,
      })),
    }));
    res.json(result);
  });

  app.post('/api/collections', async (req, res) => {
    const { id, name, link, priority, enabled } = req.body;
    await pool.query(
      'INSERT INTO collections (id, name, link, priority, enabled) VALUES ($1,$2,$3,$4,$5)',
      [id, name, link || '#', priority || 'MEDIUM', enabled !== false]
    );
    res.json({ success: true });
  });

  app.put('/api/collections/:id', async (req, res) => {
    const { name, link, priority, enabled } = req.body;
    await pool.query(
      'UPDATE collections SET name=$1, link=$2, priority=$3, enabled=$4 WHERE id=$5',
      [name, link, priority, enabled, req.params.id]
    );
    res.json({ success: true });
  });

  app.delete('/api/collections/:id', async (req, res) => {
    await pool.query('DELETE FROM collections WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  });

  // ── Agenda: Arts ──────────────────────────────────────────────────
  app.post('/api/collections/:id/arts', async (req, res) => {
    const { id: artId, imageUrl, description } = req.body;
    await pool.query(
      'INSERT INTO arts (id, collection_id, image_url, description) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [artId, req.params.id, imageUrl, description]
    );
    res.json({ success: true });
  });

  app.put('/api/arts/:id', async (req, res) => {
    const { description, lastUsed } = req.body;
    await pool.query(
      'UPDATE arts SET description=$1, last_used=$2 WHERE id=$3',
      [description, lastUsed ?? null, req.params.id]
    );
    res.json({ success: true });
  });

  app.delete('/api/arts/:id', async (req, res) => {
    const { rows } = await pool.query('SELECT image_url FROM arts WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM arts WHERE id = $1', [req.params.id]);
    if (rows[0]?.image_url?.startsWith('/uploads/')) {
      const filePath = path.join(uploadsDir, path.basename(rows[0].image_url));
      fs.unlink(filePath, () => {});
    }
    res.json({ success: true });
  });

  // ── Agenda: Schedule Slots ─────────────────────────────────────────
  app.get('/api/schedule-slots', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM schedule_slots ORDER BY sort_order ASC, time ASC');
    res.json(rows.map(r => ({ id: r.id, time: r.time, isPrime: r.is_prime })));
  });

  app.post('/api/schedule-slots', async (req, res) => {
    const { id, time, isPrime, sortOrder } = req.body;
    await pool.query(
      'INSERT INTO schedule_slots (id, time, is_prime, sort_order) VALUES ($1,$2,$3,$4)',
      [id, time, isPrime || false, sortOrder || 0]
    );
    res.json({ success: true });
  });

  app.delete('/api/schedule-slots/:id', async (req, res) => {
    await pool.query('DELETE FROM schedule_slots WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  });

  // ── Upload from URL ou data: ──────────────────────────────────────
  app.post('/api/upload-url', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });
    try {
      let buffer: Buffer;
      let ext = '.jpg';

      if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) throw new Error('Invalid data URL');
        const mime = match[1];
        ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
        buffer = Buffer.from(match[2], 'base64');
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (!response.ok) throw new Error(`Failed: ${response.statusText}`);
          const mime = response.headers.get('content-type') || 'image/jpeg';
          ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
          buffer = Buffer.from(await response.arrayBuffer());
        } catch (e) {
          clearTimeout(timer);
          throw e;
        }
      }

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      res.json({ url: `/uploads/${filename}` });
    } catch (e: any) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── Image Upload ───────────────────────────────────────────────────
  app.post('/api/upload', upload.array('images', 20), (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const urls = files.map(f => `/uploads/${f.filename}`);
    res.json({ urls });
  });

  // Helper: lê configurações Instagram do banco
  const getInstagramSettings = async () => {
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key = ANY(ARRAY['instagram_access_token','instagram_user_id','instagram_base_url'])"
    );
    const map = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
    return {
      accessToken: map['instagram_access_token'] || '',
      igUserId:    map['instagram_user_id'] || '',
      baseUrl:     map['instagram_base_url'] || `http://localhost:${PORT}`,
    };
  };

  // ── Instagram: helper de publicação real (usado pelo worker) ─────────
  const publishContainerNow = async (
    imageUrl: string, linkUrl: string, caption: string | null,
    accessToken: string, igUserId: string, baseUrl: string,
  ): Promise<string> => {
    const fullImageUrl = imageUrl.startsWith('/') ? `${baseUrl}${imageUrl}` : imageUrl;

    // Passo 1: cria container
    const containerParams = new URLSearchParams({
      image_url:        fullImageUrl,
      media_type:       'STORIES',
      access_token:     accessToken,
      link_sticker_url: linkUrl,       // parâmetro correto para link sticker
    });
    if (caption) containerParams.set('caption', caption);

    const containerRes  = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, { method: 'POST', body: containerParams });
    const containerJson = await containerRes.json() as any;
    if (containerJson.error) throw new Error(containerJson.error.message);

    // Passo 2: aguarda FINISHED
    const creationId = containerJson.id;
    let statusCode = 'IN_PROGRESS';
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const s = await fetch(`https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`);
      const sj = await s.json() as any;
      statusCode = sj.status_code ?? 'ERROR';
      if (statusCode === 'FINISHED') break;
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') throw new Error(`Container ${statusCode}`);
    }
    if (statusCode !== 'FINISHED') throw new Error('Timeout: Instagram ainda processando a imagem');

    // Passo 3: publica
    const publishParams = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
    const publishRes  = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, { method: 'POST', body: publishParams });
    const publishJson = await publishRes.json() as any;
    if (publishJson.error) throw new Error(publishJson.error.message);
    return publishJson.id as string;
  };

  // Worker: publica itens da fila cujo horário chegou
  const processInstagramQueue = async () => {
    const { rows } = await pool.query(
      "SELECT * FROM instagram_queue WHERE status = 'pending' AND scheduled_at <= $1 LIMIT 5",
      [Date.now()]
    );
    for (const item of rows) {
      await pool.query("UPDATE instagram_queue SET status = 'processing' WHERE id = $1", [item.id]);
      try {
        const { accessToken, igUserId, baseUrl } = await getInstagramSettings();
        if (!accessToken || !igUserId) throw new Error('Instagram não configurado');
        const postId = await publishContainerNow(item.image_url, item.link_url, item.caption, accessToken, igUserId, baseUrl);
        await pool.query("UPDATE instagram_queue SET status = 'published', ig_post_id = $1 WHERE id = $2", [postId, item.id]);
        console.log(`[IG Queue] Publicado: ${postId}`);
      } catch (e: any) {
        await pool.query("UPDATE instagram_queue SET status = 'failed', error = $1 WHERE id = $2", [e.message, item.id]);
        console.error(`[IG Queue] Falha no item ${item.id}:`, e.message);
      }
    }
  };

  // ── Instagram Graph API ───────────────────────────────────────────
  app.get('/api/instagram/config', async (_req, res) => {
    const { accessToken, igUserId } = await getInstagramSettings();
    res.json({ configured: !!(accessToken && igUserId) });
  });

  // Enfileira um story para publicação no horário agendado
  app.post('/api/instagram/queue-story', async (req, res) => {
    const { imageUrl, linkUrl, linkStickerX, linkStickerY, caption, scheduledAt } = req.body;
    if (!imageUrl || !linkUrl || !scheduledAt) {
      res.status(400).json({ error: 'imageUrl, linkUrl e scheduledAt são obrigatórios' });
      return;
    }
    const { rows } = await pool.query(
      'INSERT INTO instagram_queue (image_url, link_url, link_sticker_x, link_sticker_y, caption, scheduled_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [imageUrl, linkUrl, linkStickerX ?? 0.5, linkStickerY ?? 0.85, caption || null, scheduledAt]
    );
    res.json({ queueId: rows[0].id });
  });

  // Publicação imediata (sem fila)
  app.post('/api/instagram/publish-story', async (req, res) => {
    const { imageUrl, linkUrl, caption } = req.body;
    const { accessToken, igUserId, baseUrl } = await getInstagramSettings();
    if (!accessToken || !igUserId) {
      res.status(400).json({ error: 'Instagram não configurado' });
      return;
    }
    try {
      const postId = await publishContainerNow(imageUrl, linkUrl, caption || null, accessToken, igUserId, baseUrl);
      res.json({ success: true, postId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/instagram/queue', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM instagram_queue ORDER BY scheduled_at ASC');
    res.json(rows);
  });

  app.delete('/api/instagram/queue/:id', async (req, res) => {
    await pool.query("UPDATE instagram_queue SET status = 'cancelled' WHERE id = $1 AND status = 'pending'", [req.params.id]);
    res.json({ success: true });
  });

  // Troca token curto por token de longa duração (60 dias)
  app.post('/api/instagram/refresh-token', async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key = ANY(ARRAY['instagram_access_token','facebook_app_id','facebook_app_secret'])"
    );
    const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    const currentToken = map['instagram_access_token'];
    const appId        = map['facebook_app_id'];
    const appSecret    = map['facebook_app_secret'];

    if (!currentToken || !appId || !appSecret) {
      res.status(400).json({ error: 'Preencha o token atual, App ID e App Secret antes de renovar.' });
      return;
    }

    try {
      const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(currentToken)}`;
      const r    = await fetch(url);
      const data = await r.json() as any;
      if (data.error) throw new Error(data.error.message);

      await pool.query(
        "INSERT INTO settings (key, value) VALUES ('instagram_access_token', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
        [data.access_token]
      );
      const expiresInDays = Math.floor((data.expires_in || 0) / 86400);
      res.json({ success: true, newToken: data.access_token, expiresInDays });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Vite / Static ──────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.join(process.cwd(), 'dist', 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Marketing Studio running on http://localhost:${PORT}`);
    // Inicia worker da fila do Instagram (verifica a cada 30s)
    setInterval(processInstagramQueue, 30_000);
    processInstagramQueue(); // roda imediatamente ao iniciar
  });
}

startServer().catch(console.error);
