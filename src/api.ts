import type { SentLog, Collection, Art, TimeSlot } from './types';

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const jsonHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...authHeaders(),
});

// ── Email ──────────────────────────────────────────────────────────────
export const getLog = async (): Promise<SentLog[]> => {
  const res = await fetch('/api/log', { headers: authHeaders() });
  return res.json();
};

export const addToLog = async (entry: Omit<SentLog, 'id' | 'created_at'>): Promise<void> => {
  await fetch('/api/log', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(entry),
  });
};

export const deleteLog = async (id: number): Promise<void> => {
  await fetch(`/api/log/${id}`, { method: 'DELETE', headers: authHeaders() });
};

export const getSetting = async (key: string): Promise<string | null> => {
  const res = await fetch(`/api/settings/${key}`, { headers: authHeaders() });
  const data = await res.json();
  return data.value;
};

export const saveSetting = async (key: string, value: string): Promise<void> => {
  await fetch('/api/settings', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ key, value }),
  });
};

export const fetchFeedProxy = async (url: string): Promise<string> => {
  const res = await fetch(`/api/proxy-feed?url=${encodeURIComponent(url)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch feed');
  return res.text();
};

export const fetchImageAsBase64 = async (url: string): Promise<string> => {
  const res = await fetch(`/api/proxy-feed?url=${encodeURIComponent(url)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch image via proxy');
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${contentType};base64,${btoa(binary)}`;
};

// ── Agenda: Collections ────────────────────────────────────────────────
export const getCollections = async (): Promise<Collection[]> => {
  const res = await fetch('/api/collections', { headers: authHeaders() });
  return res.json();
};

export const createCollection = async (col: Omit<Collection, 'arts'>): Promise<void> => {
  await fetch('/api/collections', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(col),
  });
};

export const updateCollection = async (id: string, data: Partial<Collection>): Promise<void> => {
  await fetch(`/api/collections/${id}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  });
};

export const deleteCollection = async (id: string): Promise<void> => {
  await fetch(`/api/collections/${id}`, { method: 'DELETE', headers: authHeaders() });
};

// ── Agenda: Arts ───────────────────────────────────────────────────────
export const addArtToCollection = async (collectionId: string, art: Pick<Art, 'id' | 'imageUrl' | 'description'>): Promise<void> => {
  await fetch(`/api/collections/${collectionId}/arts`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ id: art.id, imageUrl: art.imageUrl, description: art.description }),
  });
};

export const updateArt = async (id: string, data: { description?: string; lastUsed?: number | null }): Promise<void> => {
  await fetch(`/api/arts/${id}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  });
};

export const deleteArt = async (id: string): Promise<void> => {
  await fetch(`/api/arts/${id}`, { method: 'DELETE', headers: authHeaders() });
};

// ── Agenda: Schedule Slots ─────────────────────────────────────────────
export const getScheduleSlots = async (): Promise<TimeSlot[]> => {
  const res = await fetch('/api/schedule-slots', { headers: authHeaders() });
  return res.json();
};

export const createScheduleSlot = async (slot: TimeSlot & { sortOrder?: number }): Promise<void> => {
  await fetch('/api/schedule-slots', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(slot),
  });
};

export const deleteScheduleSlot = async (id: string): Promise<void> => {
  await fetch(`/api/schedule-slots/${id}`, { method: 'DELETE', headers: authHeaders() });
};

// ── Instagram ──────────────────────────────────────────────────────────
export const getInstagramConfig = async (): Promise<{ configured: boolean }> => {
  const res = await fetch('/api/instagram/config', { headers: authHeaders() });
  return res.json();
};

export const publishInstagramStory = async (payload: {
  imageUrl: string;
  linkUrl: string;
  linkStickerX: number;
  linkStickerY: number;
  caption?: string;
}): Promise<{ postId: string }> => {
  const res = await fetch('/api/instagram/publish-story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao publicar no Instagram');
  return data;
};

// ── Image Upload ───────────────────────────────────────────────────────
export const uploadFromUrl = async (url: string): Promise<string> => {
  const res = await fetch('/api/upload-url', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Failed to save image');
  const data = await res.json();
  return data.url as string;
};

export const uploadImages = async (files: File[]): Promise<string[]> => {
  const formData = new FormData();
  files.forEach(f => formData.append('images', f));
  const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: formData });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.urls as string[];
};
