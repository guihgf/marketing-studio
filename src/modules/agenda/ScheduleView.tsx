import { useState } from 'react';
import type { Collection, ScheduleConfig, GenerationResult, ScheduledItem } from '../../types';
import { generateSchedule, COMMERCIAL_CTAS } from '../../../services/scheduler';
import { RefreshCw, CheckCircle, AlertTriangle, Wand2, Loader2, Download, Copy, Calendar, ChevronDown, ChevronRight, Link as LinkIcon, Sparkles, ShoppingBag, Lightbulb } from 'lucide-react';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const generateCaption = async (description: string, collectionName: string, collectionLink: string, isPrime: boolean): Promise<{ caption: string; cta: string }> => {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: `Você é especialista em marketing de moda geek/gamer.
Coleção: "${collectionName}" | Arte: "${description}" | Link: ${collectionLink}
${isPrime ? 'HORÁRIO NOBRE - use urgência máxima!' : ''}

Crie:
1. Uma legenda para Instagram (máx 150 chars) em PT-BR, informal, com emojis e hashtags relevantes.
2. Um CTA criativo curto (máx 5 palavras) em MAIÚSCULAS.

Return JSON: { "caption": "...", "cta": "..." }`
      }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Caption error: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
};

interface Props {
  collections: Collection[];
  config: ScheduleConfig;
  setCollections: React.Dispatch<React.SetStateAction<Collection[]>>;
}

const getLocalToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

export default function ScheduleView({ collections, config, setCollections }: Props) {
  const [startDate, setStartDate] = useState(getLocalToday());
  const [endDate, setEndDate] = useState(getLocalToday());
  const [results, setResults] = useState<GenerationResult[] | null>(null);
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleDay = (date: string) => setCollapsedDays(prev => ({ ...prev, [date]: !prev[date] }));

  const handleGenerate = async () => {
    if (new Date(startDate + 'T00:00:00') > new Date(endDate + 'T00:00:00')) {
      alert('Data de início deve ser anterior ou igual à data de fim.');
      return;
    }
    const genResults = generateSchedule(collections, config, startDate, endDate);
    setResults(genResults);
    setCollapsedDays({});
    await processAIQueue(genResults);
  };

  const processAIQueue = async (currentResults: GenerationResult[]) => {
    const tasks: { dayIndex: number; slotId: string; item: ScheduledItem }[] = [];
    currentResults.forEach((day, dIdx) => day.items.forEach(item => tasks.push({ dayIndex: dIdx, slotId: item.slotId, item })));
    setLoadingItems(new Set(tasks.map(t => `${t.dayIndex}-${t.slotId}`)));

    const BATCH = 3;
    for (let i = 0; i < tasks.length; i += BATCH) {
      await Promise.all(tasks.slice(i, i + BATCH).map(async task => {
        const uid = `${task.dayIndex}-${task.slotId}`;
        try {
          const content = await generateCaption(task.item.art.description, task.item.collectionName, task.item.collectionLink, task.item.isPrime);
          setResults(prev => {
            if (!prev) return null;
            const nr = [...prev];
            const idx = nr[task.dayIndex].items.findIndex(it => it.slotId === task.slotId);
            if (idx !== -1) nr[task.dayIndex].items[idx] = { ...nr[task.dayIndex].items[idx], generatedCaption: content.caption, cta: content.cta };
            return nr;
          });
        } catch (e) { console.error('Caption failed', uid, e); }
        finally { setLoadingItems(prev => { const s = new Set(prev); s.delete(uid); return s; }); }
      }));
    }
  };

  const confirmSchedule = () => {
    if (!results) return;
    const startObj = new Date(startDate + 'T00:00:00');
    setCollections(prev => prev.map(col => {
      let arts = [...col.arts];
      results.forEach((day, dIdx) => {
        const date = new Date(startObj);
        date.setDate(date.getDate() + dIdx);
        date.setHours(12, 0, 0, 0);
        day.items.filter(item => item.art.collectionId === col.id).forEach(item => {
          arts = arts.map(a => a.id === item.art.id ? { ...a, lastUsed: date.getTime() } : a);
        });
      });
      return { ...col, arts };
    }));
    alert('Programação confirmada! Histórico de uso atualizado.');
    setResults(null);
  };

  const handleSingleRegenerate = async (dayIndex: number, item: ScheduledItem) => {
    const uid = `${dayIndex}-${item.slotId}`;
    setLoadingItems(prev => new Set(prev).add(uid));
    try {
      const content = await generateCaption(item.art.description, item.collectionName, item.collectionLink, item.isPrime);
      setResults(prev => {
        if (!prev) return null;
        const nr = [...prev];
        const idx = nr[dayIndex].items.findIndex(i => i.slotId === item.slotId);
        if (idx !== -1) nr[dayIndex].items[idx] = { ...nr[dayIndex].items[idx], generatedCaption: content.caption, cta: content.cta };
        return nr;
      });
    } finally { setLoadingItems(prev => { const s = new Set(prev); s.delete(uid); return s; }); }
  };

  const handleRegenerateCommercialCTA = (dayIndex: number, slotId: string) => {
    setResults(prev => {
      if (!prev) return null;
      const nr = [...prev];
      const idx = nr[dayIndex].items.findIndex(i => i.slotId === slotId);
      if (idx !== -1) {
        const cur = nr[dayIndex].items[idx].ctaCommercial;
        let next = cur;
        while (next === cur) next = COMMERCIAL_CTAS[Math.floor(Math.random() * COMMERCIAL_CTAS.length)];
        nr[dayIndex].items[idx] = { ...nr[dayIndex].items[idx], ctaCommercial: next };
      }
      return nr;
    });
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const downloadImage = async (url: string, name: string) => {
    try {
      const blob = await fetch(url).then(r => r.blob());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `arte-${name.replace(/\s+/g, '-').toLowerCase()}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { window.open(url, '_blank'); }
  };

  const isGenerating = loadingItems.size > 0 && results !== null;

  return (
    <div className="space-y-8">
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2"><Calendar className="text-emerald-400" /> Gerador de Stories</h3>
            <p className="text-slate-400 text-sm mt-1">Selecione o período para gerar a grade.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-end gap-4 w-full md:w-auto">
            <div className="flex gap-4 w-full sm:w-auto">
              {[['Início', startDate, setStartDate, ''], ['Fim', endDate, setEndDate, startDate]].map(([label, val, setter, min]) => (
                <div key={label as string} className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">{label as string}</label>
                  <input type="date" value={val as string} min={min as string || undefined}
                    onChange={e => (setter as any)(e.target.value)}
                    className="bg-slate-900 border border-slate-600 rounded-lg p-2 text-white text-sm w-full focus:border-emerald-500 outline-none" />
                </div>
              ))}
            </div>
            <button onClick={handleGenerate} disabled={isGenerating}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-lg flex items-center justify-center gap-2">
              {isGenerating ? <><Loader2 className="animate-spin" size={18} /> Gerando IA...</> : <><RefreshCw size={18} /> Gerar</>}
            </button>
          </div>
        </div>
      </div>

      {results && (
        <div className="space-y-8">
          <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-lg border border-slate-700">
            <span className="text-slate-300 font-medium">Programação gerada: <span className="text-white font-bold">{results.length} dias</span></span>
            <button onClick={confirmSchedule} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 text-sm">
              <CheckCircle size={18} /> Confirmar Grade
            </button>
          </div>

          {results.map((dayResult, dayIndex) => {
            const isCollapsed = collapsedDays[dayResult.date];
            return (
              <div key={dayIndex} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div onClick={() => toggleDay(dayResult.date)} className="p-4 bg-slate-900/80 hover:bg-slate-900 cursor-pointer flex items-center justify-between border-b border-slate-700">
                  <div className="flex items-center gap-3">
                    <h4 className="text-lg font-bold text-white capitalize">{dayResult.date}</h4>
                    {dayResult.warnings.length > 0 && (
                      <span className="text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded text-xs border border-orange-500/20 flex items-center gap-1">
                        <AlertTriangle size={12} /> {dayResult.warnings.length} alertas
                      </span>
                    )}
                  </div>
                  {isCollapsed ? <ChevronDown className="text-slate-400" /> : <ChevronRight className="text-slate-400" />}
                </div>

                {!isCollapsed && (
                  <div className="p-4 space-y-4">
                    {dayResult.warnings.length > 0 && (
                      <div className="bg-orange-950/30 border border-orange-500/20 p-3 rounded text-sm text-orange-300">
                        {dayResult.warnings.map((w, i) => <p key={i}>• {w}</p>)}
                      </div>
                    )}
                    {dayResult.items.map(item => {
                      const uid = `${dayIndex}-${item.slotId}`;
                      const loading = loadingItems.has(uid);
                      return (
                        <div key={item.slotId} className={`relative flex flex-col sm:flex-row bg-slate-900/40 rounded-lg overflow-hidden border ${item.isPrime ? 'border-purple-500/50' : 'border-slate-700/50'}`}>
                          <div className={`sm:w-24 flex flex-row sm:flex-col justify-between sm:justify-center items-center p-3 ${item.isPrime ? 'bg-purple-900/20 text-purple-300' : 'bg-slate-800 text-slate-400'}`}>
                            <span className="text-xl font-mono font-bold">{item.slotTime}</span>
                            <span className="text-[10px] uppercase font-bold tracking-wider">{item.isPrime ? 'NOBRE' : 'COMUM'}</span>
                          </div>
                          <div className="flex-1 p-3 flex flex-row gap-4 items-start">
                            <div className="group relative h-40 w-24 shrink-0 rounded bg-black border border-slate-700 overflow-hidden cursor-pointer" onClick={() => downloadImage(item.art.imageUrl, item.art.description)}>
                              <img src={item.art.imageUrl} alt="Arte" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2">
                                <Download className="text-white" size={24} />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 space-y-3">
                              <div>
                                <h5 className="text-base font-bold text-white truncate">{item.art.description}</h5>
                                <p className="text-xs text-emerald-400 font-medium truncate">{item.collectionName}</p>
                              </div>
                              <div className="flex flex-col gap-2">
                                <button onClick={() => copy(item.collectionLink, `link-${uid}`)} className="flex items-center justify-between w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-3 py-2 group text-left">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <LinkIcon size={14} className="text-slate-500 shrink-0" />
                                    <span className="text-xs text-blue-400 truncate">{item.collectionLink}</span>
                                  </div>
                                  {copiedId === `link-${uid}` ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} className="text-slate-600 group-hover:text-white" />}
                                </button>

                                {/* CTA Criativo */}
                                <div>
                                  {loading ? (
                                    <div className="h-9 bg-slate-800/50 rounded animate-pulse border border-slate-700 flex items-center px-3 gap-2">
                                      <div className="w-8 h-4 bg-slate-700 rounded" /><div className="w-24 h-4 bg-slate-700 rounded" />
                                    </div>
                                  ) : (
                                    <button onClick={() => copy(item.cta, `cta-${uid}`)} className="flex items-center justify-between w-full bg-purple-900/20 hover:bg-purple-900/30 border border-purple-500/30 rounded px-3 py-2 group text-left">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Lightbulb size={12} className="text-purple-400" />
                                        <span className="text-[10px] font-bold text-purple-300 bg-purple-900/50 px-1.5 py-0.5 rounded uppercase">CRIATIVO</span>
                                        <span className="text-xs text-white font-bold truncate uppercase">{item.cta}</span>
                                      </div>
                                      {copiedId === `cta-${uid}` ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} className="text-purple-400/50 group-hover:text-purple-400" />}
                                    </button>
                                  )}
                                </div>

                                {/* CTA Comercial */}
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => copy(item.ctaCommercial || 'COMPRE AGORA', `cta-com-${uid}`)} className="flex-1 flex items-center justify-between bg-emerald-900/20 hover:bg-emerald-900/30 border border-emerald-500/30 rounded px-3 py-2 group text-left">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <ShoppingBag size={12} className="text-emerald-400" />
                                      <span className="text-[10px] font-bold text-emerald-300 bg-emerald-900/50 px-1.5 py-0.5 rounded uppercase">VENDA</span>
                                      <span className="text-xs text-white font-bold truncate uppercase">{item.ctaCommercial || 'COMPRE AGORA'}</span>
                                    </div>
                                    {copiedId === `cta-com-${uid}` ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} className="text-emerald-400/50 group-hover:text-emerald-400" />}
                                  </button>
                                  <button onClick={() => handleRegenerateCommercialCTA(dayIndex, item.slotId)} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-2.5 text-slate-400 hover:text-emerald-400">
                                    <RefreshCw size={14} />
                                  </button>
                                </div>

                                {/* Caption IA */}
                                <div className="pt-2 border-t border-slate-800/50">
                                  {loading ? (
                                    <div className="flex items-center justify-center gap-2 py-4 bg-slate-950/50 border border-dashed border-slate-800 rounded text-xs text-blue-300/70">
                                      <Loader2 size={16} className="animate-spin text-blue-500" />
                                      <span className="animate-pulse">Criando legenda...</span>
                                    </div>
                                  ) : !item.generatedCaption ? (
                                    <button onClick={() => handleSingleRegenerate(dayIndex, item)} className="text-xs flex items-center gap-1.5 bg-gradient-to-r from-blue-600/20 to-purple-600/20 hover:from-blue-600/30 hover:to-purple-600/30 border border-blue-500/30 text-blue-300 px-3 py-1.5 rounded w-full justify-center">
                                      <Sparkles size={14} /> Tentar IA Novamente
                                    </button>
                                  ) : (
                                    <div className="space-y-2">
                                      <div onClick={() => copy(item.generatedCaption || '', `cap-${uid}`)} className="bg-slate-950 border border-slate-800 p-3 rounded cursor-pointer hover:border-slate-600 group relative">
                                        <div className="absolute top-2 right-2 text-slate-500 group-hover:text-white">
                                          {copiedId === `cap-${uid}` ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
                                        </div>
                                        <p className="text-xs text-slate-300 italic pr-6 leading-relaxed">"{item.generatedCaption}"</p>
                                      </div>
                                      <div className="flex justify-end">
                                        <button onClick={() => handleSingleRegenerate(dayIndex, item)} className="text-[10px] text-slate-500 hover:text-blue-400 flex items-center gap-1">
                                          <RefreshCw size={10} /> Regenerar IA
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex justify-center pt-6 pb-12">
            <button onClick={confirmSchedule} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2 shadow-lg">
              <CheckCircle size={20} /> Confirmar Grade Completa
            </button>
          </div>
        </div>
      )}

      {!results && collections.length === 0 && (
        <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
          <Wand2 className="mx-auto h-12 w-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300">Nenhuma coleção cadastrada</h3>
          <p className="text-slate-500 mt-1">Adicione coleções na aba "Coleções" antes de gerar.</p>
        </div>
      )}
    </div>
  );
}
