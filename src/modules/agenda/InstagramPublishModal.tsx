import { useState } from 'react';
import type { ScheduledItem } from '../../types';
import { queueInstagramStory, publishInstagramStory } from '../../api';
import {
  X, CalendarClock, Send, Loader2, Instagram,
} from 'lucide-react';

interface Props {
  item: ScheduledItem;
  date: string;           // "YYYY-MM-DD"
  onClose: () => void;
  onQueued: (queueId: number) => void;
  onPublished: (postId: string) => void;
}

const fmtDate = (date: string, time: string) =>
  new Date(`${date}T${time}:00`).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

export default function InstagramPublishModal({ item, date, onClose, onQueued, onPublished }: Props) {
  const [acting, setActing] = useState<'queue' | 'publish' | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const scheduledAt  = new Date(`${date}T${item.slotTime}:00`).getTime();
  const scheduledStr = fmtDate(date, item.slotTime);
  const busy         = acting !== null;

  const handleQueue = async () => {
    setActing('queue');
    setError(null);
    try {
      const r = await queueInstagramStory({
        imageUrl: item.art.imageUrl, linkUrl: item.collectionLink,
        linkStickerX: 0.5, linkStickerY: 0.85, scheduledAt,
      });
      onQueued(r.queueId);
    } catch (e: any) { setError(e.message); }
    finally { setActing(null); }
  };

  const handlePublishNow = async () => {
    setActing('publish');
    setError(null);
    try {
      const r = await publishInstagramStory({
        imageUrl: item.art.imageUrl, linkUrl: item.collectionLink,
        linkStickerX: 0.5, linkStickerY: 0.85,
      });
      onPublished(r.postId);
    } catch (e: any) { setError(e.message); }
    finally { setActing(null); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Instagram size={20} className="text-pink-400" />
            Publicar Story no Instagram
          </h2>
          <button onClick={onClose} disabled={busy} className="text-slate-400 hover:text-white transition-colors disabled:opacity-40">
            <X size={20} />
          </button>
        </div>

        {/* Info do agendamento */}
        <div className="mx-5 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-slate-900/50 border-slate-700 text-sm text-slate-400">
          <CalendarClock size={15} className="text-pink-400 shrink-0" />
          Horário da agenda: <strong className="text-white ml-1">{scheduledStr}</strong>
        </div>

        <div className="p-5 flex flex-col md:flex-row gap-6">

          {/* Preview 9:16 */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            <p className="text-xs text-slate-400">Preview</p>
            <div className="relative w-28 h-48 rounded-xl overflow-hidden border border-slate-600 bg-black shadow-xl">
              <img src={item.art.imageUrl} alt="Arte" className="w-full h-full object-cover" />
            </div>
            <p className="text-[10px] text-slate-500 text-center">{item.slotTime} · {item.collectionName}</p>
          </div>

          {error && <div className="flex-1 bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-xs text-red-300 self-start">{error}</div>}
        </div>

        {/* Rodapé */}
        <div className="p-5 border-t border-slate-700 flex flex-col sm:flex-row justify-end gap-3">
          <button onClick={onClose} disabled={busy}
            className="px-5 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm font-medium transition-colors order-last sm:order-first">
            Cancelar
          </button>

          <button onClick={handlePublishNow} disabled={busy}
            className="px-5 py-2.5 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all border border-slate-500">
            {acting === 'publish'
              ? <><Loader2 size={15} className="animate-spin" /> Publicando...</>
              : <><Send size={15} /> Publicar Agora</>}
          </button>

          <button onClick={handleQueue} disabled={busy}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all">
            {acting === 'queue'
              ? <><Loader2 size={15} className="animate-spin" /> Agendando...</>
              : <><CalendarClock size={15} /> Agendar para {item.slotTime}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
