import { useState } from 'react';
import type { ScheduledItem } from '../../types';
import { publishInstagramStory } from '../../api';
import {
  X, Send, CheckCircle, Loader2, Link as LinkIcon,
  Lightbulb, ShoppingBag, MessageSquare, Instagram,
} from 'lucide-react';

interface Props {
  item: ScheduledItem;
  onClose: () => void;
  onPublished: (postId: string) => void;
}

// Grade 3×3 que representa a tela do story (retrato 9:16)
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

export default function InstagramPublishModal({ item, onClose, onPublished }: Props) {
  const [selectedCta, setSelectedCta]   = useState<CtaKey>('criativo');
  const [positionIdx, setPositionIdx]   = useState(7); // Base center (padrão Instagram)
  const [publishing, setPublishing]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const ctaOptions: { key: CtaKey; label: string; icon: React.ReactNode; text: string; color: string }[] = [
    {
      key: 'criativo', label: 'Criativo', icon: <Lightbulb size={14} />,
      text: item.cta || '', color: 'purple',
    },
    {
      key: 'comercial', label: 'Venda', icon: <ShoppingBag size={14} />,
      text: item.ctaCommercial || 'COMPRE AGORA', color: 'emerald',
    },
    {
      key: 'caption', label: 'Legenda IA', icon: <MessageSquare size={14} />,
      text: item.generatedCaption || '', color: 'blue',
    },
  ];

  const selectedCtaText = ctaOptions.find(o => o.key === selectedCta)?.text ?? '';
  const selectedPos     = POSITIONS[positionIdx];

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const result = await publishInstagramStory({
        imageUrl:      item.art.imageUrl,
        linkUrl:       item.collectionLink,
        linkStickerX:  selectedPos.x,
        linkStickerY:  selectedPos.y,
        caption:       selectedCtaText || undefined,
      });
      onPublished(result.postId);
    } catch (e: any) {
      setError(e.message || 'Erro ao publicar');
    } finally {
      setPublishing(false);
    }
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
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex flex-col md:flex-row gap-6">

          {/* Preview do story em proporção 9:16 */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            <p className="text-xs text-slate-400">Preview</p>
            <div className="relative w-28 h-48 rounded-xl overflow-hidden border border-slate-600 bg-black shadow-xl">
              <img src={item.art.imageUrl} alt="Arte" className="w-full h-full object-cover" />
              {/* Sticker de link simulado */}
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 bg-white/90 text-black text-[7px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow pointer-events-none max-w-[80%]"
                style={{ left: `${selectedPos.x * 100}%`, top: `${selectedPos.y * 100}%` }}
              >
                <LinkIcon size={5} />
                <span className="truncate">Link</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 text-center leading-tight">
              {item.slotTime} · {item.collectionName}
            </p>
          </div>

          {/* Configuração */}
          <div className="flex-1 space-y-5 min-w-0">

            {/* Seleção de CTA */}
            <div>
              <p className="text-sm font-semibold text-slate-300 mb-2">CTA / Legenda</p>
              <div className="space-y-1.5">
                {ctaOptions.map(opt => {
                  const isSelected = selectedCta === opt.key;
                  const disabled   = opt.key === 'caption' && !item.generatedCaption;
                  const colorMap: Record<string, string> = {
                    purple:  isSelected ? 'bg-purple-900/40 border-purple-500 text-white' : '',
                    emerald: isSelected ? 'bg-emerald-900/40 border-emerald-500 text-white' : '',
                    blue:    isSelected ? 'bg-blue-900/40 border-blue-500 text-white' : '',
                  };
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setSelectedCta(opt.key)}
                      disabled={disabled}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all text-sm
                        ${isSelected ? colorMap[opt.color] : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-slate-500'}
                        disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
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

            {/* Posição do sticker */}
            <div>
              <p className="text-sm font-semibold text-slate-300 mb-2">Posição do Sticker de Link</p>
              <div className="grid grid-cols-3 gap-1.5">
                {POSITIONS.map((pos, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPositionIdx(idx)}
                    className={`py-1.5 text-[10px] rounded border transition-all font-medium ${
                      positionIdx === idx
                        ? 'bg-pink-600 border-pink-400 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* URL do link */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Link do Sticker</p>
              <p className="text-xs text-blue-400 truncate">{item.collectionLink}</p>
            </div>

            {/* Erro */}
            {error && (
              <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="p-5 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-sm flex items-center gap-2 transition-all"
          >
            {publishing
              ? <><Loader2 size={16} className="animate-spin" /> Publicando...</>
              : <><Send size={16} /> Publicar Agora</>}
          </button>
        </div>
      </div>
    </div>
  );
}
