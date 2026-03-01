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

  // ── Instagram Graph API ───────────────────────────────────────────
  app.get('/api/instagram/config', async (_req, res) => {
    const { accessToken, igUserId } = await getInstagramSettings();
    res.json({ configured: !!(accessToken && igUserId) });
  });

  app.post('/api/instagram/publish-story', async (req, res) => {
    const { imageUrl, linkUrl, linkStickerX, linkStickerY, caption } = req.body;
    const { accessToken, igUserId, baseUrl } = await getInstagramSettings();

    if (!accessToken || !igUserId) {
      res.status(400).json({ error: 'Instagram não configurado. Preencha INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_USER_ID no .env' });
      return;
    }

    // Garante URL pública para o Instagram acessar a imagem
    const fullImageUrl = (imageUrl as string).startsWith('/') ? `${baseUrl}${imageUrl}` : imageUrl;

    try {
      // Passo 1: cria container de mídia
      const containerParams = new URLSearchParams({
        image_url:    fullImageUrl,
        media_type:   'STORIES',
        access_token: accessToken,
        link_sticker: JSON.stringify({
          link_sticker_url: linkUrl,
          x: String(linkStickerX ?? 0.5),
          y: String(linkStickerY ?? 0.85),
        }),
      });
      if (caption) containerParams.set('caption', caption);

      const containerRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media`,
        { method: 'POST', body: containerParams },
      );
      const containerJson = await containerRes.json() as any;
      if (!containerRes.ok || containerJson.error) {
        res.status(500).json({ error: containerJson.error?.message || 'Falha ao criar container no Instagram' });
        return;
      }

      // Passo 2: aguarda container ficar FINISHED (processamento assíncrono do Instagram)
      const creationId = containerJson.id;
      const MAX_TRIES = 12;
      const INTERVAL_MS = 3000;
      let statusCode = 'IN_PROGRESS';

      for (let i = 0; i < MAX_TRIES; i++) {
        await new Promise(r => setTimeout(r, INTERVAL_MS));
        const statusRes  = await fetch(
          `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
        );
        const statusJson = await statusRes.json() as any;
        statusCode = statusJson.status_code ?? 'ERROR';
        if (statusCode === 'FINISHED') break;
        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
          res.status(500).json({ error: `Container com erro: ${statusCode}` });
          return;
        }
      }

      if (statusCode !== 'FINISHED') {
        res.status(500).json({ error: 'Timeout: Instagram ainda está processando a imagem. Tente novamente.' });
        return;
      }

      // Passo 3: publica o container
      const publishParams = new URLSearchParams({
        creation_id:  creationId,
        access_token: accessToken,
      });
      const publishRes  = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
        { method: 'POST', body: publishParams },
      );
      const publishJson = await publishRes.json() as any;
      if (!publishRes.ok || publishJson.error) {
        res.status(500).json({ error: publishJson.error?.message || 'Falha ao publicar no Instagram' });
        return;
      }

      res.json({ success: true, postId: publishJson.id });
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
  });
}

startServer().catch(console.error);
