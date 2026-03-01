// ── Email Module ──────────────────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  description: string;
  link: string;
  image_link: string;
  price: string;
}

export interface SentLog {
  id: number;
  product_id: string;
  product_name: string;
  sent_date: string;
  subject: string;
  body: string;
  created_at: string;
}

export interface EmailDraft {
  day: string;
  strategy: 'single' | 'collection';
  theme?: string;
  products: Product[];
  subject: string;
  body: string;
  status: 'generating' | 'pending' | 'approved';
  generated_image?: string;
}

// ── Agenda Module ─────────────────────────────────────────────────────
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Art {
  id: string;
  collectionId: string;
  imageUrl: string;
  description: string;
  lastUsed: number | null;
}

export interface Collection {
  id: string;
  name: string;
  link: string;
  priority: Priority;
  enabled: boolean;
  arts: Art[];
}

export interface TimeSlot {
  id: string;
  time: string;
  isPrime: boolean;
}

export interface ScheduleConfig {
  slots: TimeSlot[];
}

export interface ScheduledItem {
  slotId: string;
  slotTime: string;
  isPrime: boolean;
  art: Art;
  collectionName: string;
  collectionLink: string;
  generatedCaption?: string;
  cta: string;
  ctaCommercial?: string;
  instagramPostId?: string;
}

export interface GenerationResult {
  date: string;
  items: ScheduledItem[];
  warnings: string[];
}

// ── Arte Module ───────────────────────────────────────────────────────
export interface GeneratedStory {
  imageUrl: string;
  promptUsed: string;
  thinkingProcess?: string;
}
