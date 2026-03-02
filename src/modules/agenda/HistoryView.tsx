import { useState, useEffect } from 'react';
import { getScheduleHistory } from '../../api';
import { Loader2, RefreshCw, ChevronDown, ChevronRight, History } from 'lucide-react';

type HistoryDay = {
  date: string;
  items: Array<{
    slotTime: string;
    isPrime: boolean;
    artDesc: string;
    artImageUrl: string;
    collectionName: string;
  }>;
};

type HistoryEntry = {
  id: number;
  confirmed_at: string;
  period_start: string;
  period_end: string;
  days: HistoryDay[];
};

const fmtDate = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function HistoryView() {
  const [entries, setEntries]   = useState<HistoryEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const raw = await getScheduleHistory();
      setEntries(raw.map((e: any) => ({
        ...e,
        days: typeof e.days === 'string' ? JSON.parse(e.days) : e.days,
      })));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500 w-8 h-8" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <History size={20} className="text-emerald-400" /> Histórico de Grades
        </h3>
        <button onClick={load} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-lg">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
          <History className="mx-auto h-12 w-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300">Nenhum histórico</h3>
          <p className="text-slate-500">Confirme uma grade para registrar aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(entry => {
            const isOpen = expanded === entry.id;
            const totalArts = entry.days.reduce((acc, d) => acc + d.items.length, 0);
            const isSameDay = entry.period_start === entry.period_end;
            return (
              <div key={entry.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : entry.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-900/30 transition-colors text-left"
                >
                  <div>
                    <p className="font-bold text-white">
                      {isSameDay ? fmtDate(entry.period_start) : `${fmtDate(entry.period_start)} → ${fmtDate(entry.period_end)}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Confirmado em {fmtDateTime(entry.confirmed_at)} · {entry.days.length} dia{entry.days.length !== 1 ? 's' : ''} · {totalArts} arte{totalArts !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {isOpen
                    ? <ChevronDown className="text-slate-400 shrink-0" size={18} />
                    : <ChevronRight className="text-slate-400 shrink-0" size={18} />}
                </button>

                {isOpen && (
                  <div className="border-t border-slate-700 p-4 space-y-5">
                    {entry.days.map((day, dIdx) => (
                      <div key={dIdx}>
                        <h5 className="text-sm font-semibold text-slate-300 mb-3">{fmtDate(day.date)}</h5>
                        <div className="flex flex-wrap gap-3">
                          {day.items.map((item, iIdx) => (
                            <div key={iIdx} className={`flex items-center gap-3 bg-slate-900/60 rounded-lg p-2.5 border ${item.isPrime ? 'border-purple-500/30' : 'border-slate-700/50'}`}>
                              <div className="w-10 h-16 rounded bg-black border border-slate-700 overflow-hidden shrink-0">
                                <img src={item.artImageUrl} alt="" className="w-full h-full object-cover" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs text-white font-bold">{item.slotTime}</p>
                                <p className="text-[10px] text-emerald-400 font-medium truncate max-w-[110px]">{item.collectionName}</p>
                                <p className="text-[10px] text-slate-400 truncate max-w-[110px]">{item.artDesc}</p>
                                {item.isPrime && <span className="text-[9px] text-purple-400 font-bold uppercase">Nobre</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
