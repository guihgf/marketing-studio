import { useState } from 'react';
import type { ScheduledItem } from '../../types';
import { queueInstagramStory, publishInstagramStory } from '../../api';
import {
  X, CalendarClock, Send, CheckCircle, Loader2, Link as LinkIcon,
  Lightbulb, ShoppingBag, MessageSquare, Instagram,
} from 'lucide-react';

interface Props {
  item: ScheduledItem;
  date: string;           // "YYYY-MM-DD"
  onClose: () => void;
  onQueued: (queueId: number) => void;
  onPublished: (postId: string) => void;
}

const POSITIONS = [
  { label: 'Topo Esq.',  x: 0.25, y: 0.12 },
  { label: 'Topo',       x: 0.50, y: 0.12 },
  { label: 'Topo Dir.',  x: 0.75, y: 0.12 },
  { label: 'Meio Esq.',  x: 0.25, y: 0.50 },
  { label: 'Centro',     x: 0.50, y: 0.50 },
  { label: 'Meio Dir.',  x: 0.75, y: 0.50 },
  { label: 'Base Esq.',  x: 0.25, y: 0.85 },
  { label: 'Base',       x: 0.50, y: 0.85 },
  { label: 'Base Dir.',  x: 0.75, y: 0.85 },
] as const;

type CtaKey = 'criativo' | 'comercial' | 'caption';

const fmtDate = (date: string, time: string) =>
  new Date(`${date}T${time}:00`).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

export default function InstagramPublishModal({ item, date, onClose, onQueued, onPublished }: Props) {
  const [selectedCta, setSelectedCta] = useState<CtaKey>('criativo');
  const [positionIdx, setPositionIdx] = useState(7);
  const [acting, setActing]           = useState<'queue' | 'publish' | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const scheduledAt  = new Date(`${date}T${item.slotTime}:00`).getTime();
  const scheduledStr = fmtDate(date, item.slotTime);

  const ctaOptions: { key: CtaKey; label: string; icon: React.ReactNode; text: string; color: string }[] = [
    { key: 'criativo',  label: 'Criativo',   icon: <Lightbulb size={14} />,     text: item.cta || '',                       color: 'purple'  },
    { key: 'comercial', label: 'Venda',       icon: <ShoppingBag size={14} />,   text: item.ctaCommercial || 'COMPRE AGORA', color: 'emerald' },
    { key: 'caption',   label: 'Legenda IA',  icon: <MessageSquare size={14} />, text: item.generatedCaption || '',          color: 'blue'    },
  ];

  const selectedCtaText = ctaOptions.find(o => o.key === selectedCta)?.text ?? '';
  const selectedPos     = POSITIONS[positionIdx];
  const busy            = acting !== null;

  const handleQueue = async () => {
    setActing('queue');
    setError(null);
    try {
      const r = await queueInstagramStory({
        imageUrl: item.art.imageUrl, linkUrl: item.collectionLink,
        linkStickerX: selectedPos.x, linkStickerY: selectedPos.y,
        caption: selectedCtaText || undefined, scheduledAt,
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
        linkStickerX: selectedPos.x, linkStickerY: selectedPos.y,
        caption: selectedCtaText || undefined,
      });
      onPublished(r.postId);
    } catch (e: any) { setError(e.message); }
    finally { setActing(null); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-2xl shadow-2xl">

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
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 bg-white/90 text-black text-[7px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow pointer-events-none max-w-[80%]"
                style={{ left: `${selectedPos.x * 100}%`, top: `${selectedPos.y * 100}%` }}
              >
                <LinkIcon size={5} /><span className="truncate">Link</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 text-center">{item.slotTime} · {item.collectionName}</p>
          </div>

          {/* Config */}
          <div className="flex-1 space-y-5 min-w-0">

            {/* CTA */}
            <div>
              <p className="text-sm font-semibold text-slate-300 mb-2">CTA / Legenda</p>
              <div className="space-y-1.5">
                {ctaOptions.map(opt => {
                  const isSelected = selectedCta === opt.key;
                  const disabled   = opt.key === 'caption' && !item.generatedCaption;
                  const ring = isSelected ? {
                    purple:  'bg-purple-900/40 border-purple-500 text-white',
                    emerald: 'bg-emerald-900/40 border-emerald-500 text-white',
                    blue:    'bg-blue-900/40 border-blue-500 text-white',
                  }[opt.color] : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-slate-500';
                  return (
                    <button key={opt.key} onClick={() => setSelectedCta(opt.key)} disabled={disabled}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all text-sm ${ring} disabled:opacity-40 disabled:cursor-not-allowed`}>
                      <span className="shrink-0 mt-0.5">{opt.icon}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider block mb-0.5">{opt.label}</span>
                        <span className="text-xs block truncate">{opt.text || '—'}</span>
                      </div>
                      {isSelected && <CheckCircle size={14} className="ml-auto shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Posição */}
            <div>
              <p className="text-sm font-semibold text-slate-300 mb-2">Posição do Sticker de Link</p>
              <div className="grid grid-cols-3 gap-1.5">
                {POSITIONS.map((_, idx) => (
                  <button key={idx} onClick={() => setPositionIdx(idx)}
                    className={`py-1.5 text-[10px] rounded border transition-all font-medium ${
                      positionIdx === idx ? 'bg-pink-600 border-pink-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}>
                    {POSITIONS[idx].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Link */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Link do Sticker</p>
              <p className="text-xs text-blue-400 truncate">{item.collectionLink}</p>
            </div>

            {error && <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">{error}</div>}
          </div>
        </div>

        {/* Rodapé — dois botões */}
        <div className="p-5 border-t border-slate-700 flex flex-col sm:flex-row justify-end gap-3">
          <button onClick={onClose} disabled={busy}
            className="px-5 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm font-medium transition-colors order-last sm:order-first">
            Cancelar
          </button>

          {/* Publicar Agora */}
          <button onClick={handlePublishNow} disabled={busy}
            className="px-5 py-2.5 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all border border-slate-500">
            {acting === 'publish'
              ? <><Loader2 size={15} className="animate-spin" /> Publicando...</>
              : <><Send size={15} /> Publicar Agora</>}
          </button>

          {/* Agendar */}
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
