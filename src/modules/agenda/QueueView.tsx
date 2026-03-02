import { useState, useEffect } from 'react';
import { getInstagramQueue, cancelInstagramQueueItem } from '../../api';
import { Loader2, RefreshCw, Trash2, CheckCircle, Clock, AlertTriangle, X, Instagram } from 'lucide-react';

type QueueItem = {
  id: number;
  image_url: string;
  link_url: string;
  scheduled_at: number;
  status: 'pending' | 'processing' | 'published' | 'failed' | 'cancelled';
  ig_post_id: string | null;
  error: string | null;
};

const STATUS_CONFIG = {
  pending:    { label: 'Aguardando',  cls: 'text-blue-400 bg-blue-500/10 border-blue-500/30',      icon: <Clock size={11} /> },
  processing: { label: 'Publicando',  cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', icon: <Loader2 size={11} className="animate-spin" /> },
  published:  { label: 'Publicado',   cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: <CheckCircle size={11} /> },
  failed:     { label: 'Falhou',      cls: 'text-red-400 bg-red-500/10 border-red-500/30',          icon: <AlertTriangle size={11} /> },
  cancelled:  { label: 'Cancelado',   cls: 'text-slate-500 bg-slate-500/10 border-slate-500/30',    icon: <X size={11} /> },
};

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function QueueView() {
  const [items, setItems]         = useState<QueueItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await getInstagramQueue()); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCancel = async (id: number) => {
    if (!confirm('Remover este post da programação?')) return;
    setCancelling(id);
    try {
      await cancelInstagramQueueItem(id);
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'cancelled' } : i));
    } finally { setCancelling(null); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500 w-8 h-8" /></div>;

  const pending   = items.filter(i => i.status === 'pending' || i.status === 'processing');
  const done      = items.filter(i => i.status === 'published' || i.status === 'failed' || i.status === 'cancelled');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Instagram size={20} className="text-pink-400" /> Posts Programados
        </h3>
        <button onClick={load} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-lg">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
          <Clock className="mx-auto h-12 w-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300">Nenhum post programado</h3>
          <p className="text-slate-500">Use o botão "Agendar" nas artes geradas na aba Agenda.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Na fila ({pending.length})</h4>
              {pending.map(item => <QueueCard key={item.id} item={item} cancelling={cancelling} onCancel={handleCancel} fmtDate={fmtDate} />)}
            </div>
          )}
          {done.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Concluídos ({done.length})</h4>
              {done.map(item => <QueueCard key={item.id} item={item} cancelling={cancelling} onCancel={handleCancel} fmtDate={fmtDate} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QueueCard({ item, cancelling, onCancel, fmtDate }: {
  item: QueueItem;
  cancelling: number | null;
  onCancel: (id: number) => void;
  fmtDate: (ts: number) => string;
}) {
  const sc = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.cancelled;
  return (
    <div className={`bg-slate-800 rounded-xl border flex items-center gap-4 p-4 ${item.status === 'cancelled' ? 'border-slate-700/40 opacity-50' : 'border-slate-700'}`}>
      <div className="w-14 h-24 rounded bg-black border border-slate-700 overflow-hidden shrink-0">
        <img src={item.image_url} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${sc.cls}`}>
            {sc.icon} {sc.label}
          </span>
          <span className="text-slate-300 text-sm font-medium">{fmtDate(item.scheduled_at)}</span>
        </div>
        {item.error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded">{item.error}</p>
        )}
        {item.ig_post_id && (
          <p className="text-[10px] text-slate-500">Post ID: {item.ig_post_id}</p>
        )}
      </div>
      {item.status === 'pending' && (
        <button
          onClick={() => onCancel(item.id)}
          disabled={cancelling === item.id}
          className="shrink-0 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {cancelling === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Cancelar
        </button>
      )}
    </div>
  );
}
