import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trash2, RefreshCw, Check, ChevronRight, FileText, Calendar, Save, Settings, RotateCcw } from 'lucide-react';
import type { SentLog, EmailDraft } from '../../types';
import { getLog, addToLog, deleteLog, getSetting, saveSetting } from '../../api';
import { parseXML } from '../../utils/parseXML';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const openRouterChat = async (prompt: string): Promise<string> => {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e: any = new Error((err as any)?.error?.message || `OpenRouter error: ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return data.choices[0].message.content;
};

const openRouterImage = async (prompt: string, referenceImageUrl?: string): Promise<string> => {
  const content = referenceImageUrl
    ? [
        { type: 'image_url', image_url: { url: referenceImageUrl } },
        { type: 'text', text: prompt },
      ]
    : prompt;
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'black-forest-labs/flux.2-pro',
      modalities: ['image'],
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e: any = new Error((err as any)?.error?.message || `OpenRouter image error: ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (msg?.images?.[0]?.image_url?.url) return msg.images[0].image_url.url;
  if (Array.isArray(msg?.content)) {
    const imgPart = msg.content.find((p: any) => p.type === 'image_url');
    if (imgPart?.image_url?.url) return imgPart.image_url.url;
  }
  if (typeof msg?.content === 'string' && msg.content.startsWith('data:')) return msg.content;
  throw new Error(`Unexpected image response: ${JSON.stringify(data).slice(0, 200)}`);
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isQuotaError = (error: any) =>
  error?.status === 429 ||
  error?.message?.includes('429') ||
  error?.message?.toLowerCase().includes('quota') ||
  error?.message?.toLowerCase().includes('rate limit');

const generateWithRetry = async (apiCall: () => Promise<any>, retries = 3, delayMs = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await apiCall();
    } catch (error: any) {
      if (isQuotaError(error)) {
        if (i === retries - 1) throw error;
        await delay(delayMs * (i + 1));
      } else {
        throw error;
      }
    }
  }
};

const DEFAULT_INSTRUCTIONS_SINGLE = `Escreva um e-mail de vendas CURTO em PT-BR. Máximo 100 palavras. Tom: urgente e direto. Foque no design da estampa. Evite clichês.`;

const DEFAULT_INSTRUCTIONS_COLLECTION = `Escreva um e-mail de coleção em PT-BR. Máximo 100 palavras. Tom: urgente, "must have". Conecte os produtos pelo tema. Destaque o primeiro produto e faça cross-sell dos demais.`;

const DEFAULT_IMAGE_PROMPT_REF = `Aplique esta estampa na frente de um(a) {style}, preservando proporções e aspect ratio originais. Estampa centralizada no peito, escalonada proporcionalmente à peça — não esticar nem cortar. Foto de jovem vestindo, estilo street, fundo urbano desfocado, luz natural, estampa totalmente visível.`;

const DEFAULT_IMAGE_PROMPT_NOREF = `Foto editorial de moda. Jovem vestindo um(a) {style} com estampa geek: "{name}" centralizada no peito, proporções preservadas. Fundo urbano, luz natural, lente 85mm, estampa claramente visível.`;

interface EmailModuleProps {
  xmlContent: string;
  refreshFeed: () => Promise<string>;
  fetchingFeed: boolean;
}

export default function EmailModule({ xmlContent, refreshFeed, fetchingFeed }: EmailModuleProps) {
  const [logs, setLogs] = useState<SentLog[]>([]);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'input' | 'drafts' | 'log' | 'config'>('input');
  const [instructionsSingle, setInstructionsSingle] = useState(DEFAULT_INSTRUCTIONS_SINGLE);
  const [instructionsCollection, setInstructionsCollection] = useState(DEFAULT_INSTRUCTIONS_COLLECTION);
  const [imagePromptRef, setImagePromptRef] = useState(DEFAULT_IMAGE_PROMPT_REF);
  const [imagePromptNoRef, setImagePromptNoRef] = useState(DEFAULT_IMAGE_PROMPT_NOREF);
  const [daysToGenerate, setDaysToGenerate] = useState(3);
  const [selectedDraftIndex, setSelectedDraftIndex] = useState(0);
  const [previewTab, setPreviewTab] = useState<'visual' | 'html'>('visual');
  const [clothingStyles, setClothingStyles] = useState<Record<number, string>>({});
  const [generatingImages, setGeneratingImages] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadLogs();
    getSetting('instructions_single').then(v => { if (v) setInstructionsSingle(v); });
    getSetting('instructions_collection').then(v => { if (v) setInstructionsCollection(v); });
    getSetting('image_prompt_ref').then(v => { if (v) setImagePromptRef(v); });
    getSetting('image_prompt_noref').then(v => { if (v) setImagePromptNoRef(v); });
  }, []);

  const loadLogs = async () => setLogs(await getLog());

  const handleSaveConfig = async () => {
    await Promise.all([
      saveSetting('instructions_single', instructionsSingle),
      saveSetting('instructions_collection', instructionsCollection),
      saveSetting('image_prompt_ref', imagePromptRef),
      saveSetting('image_prompt_noref', imagePromptNoRef),
    ]);
    alert('Configurações salvas!');
  };

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const freshXml = await refreshFeed();
      const xml = freshXml || xmlContent;
      if (!xml.trim()) { alert('Sem conteúdo XML. Configure o feed em Configurações.'); setLoading(false); return; }
      const parsed = parseXML(xml);
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
      const recentIds = logs.filter(l => new Date(l.sent_date) > fifteenDaysAgo).map(l => l.product_id);
      const available = parsed.filter(p => !recentIds.includes(p.id));

      if (available.length === 0) {
        alert('Sem produtos disponíveis! Todos foram enviados nos últimos 15 dias.');
        return;
      }

      // Nossa lógica define os produtos de cada dia — sem chamar IA para planejamento
      const today = new Date();
      const pool = [...available];
      const newDrafts: EmailDraft[] = [];

      for (let i = 0; i < daysToGenerate; i++) {
        if (pool.length === 0) break;
        const date = new Date(today);
        date.setDate(date.getDate() + i + 1);
        // Dias ímpares = coleção (4 produtos), pares = single — se houver produtos suficientes
        const useCollection = i % 2 === 1 && pool.length >= 4;
        const products = pool.splice(0, useCollection ? 4 : 1);
        newDrafts.push({
          day: date.toISOString().split('T')[0],
          strategy: useCollection ? 'collection' : 'single',
          products,
          subject: 'Gerando...',
          body: 'Gerando conteúdo...',
          status: 'generating',
        });
      }

      setDrafts(newDrafts);
      setView('drafts');

      for (let i = 0; i < newDrafts.length; i++) {
        await generateEmailContent(newDrafts[i], i);
        if (i < newDrafts.length - 1) await delay(2000);
      }
    } catch (error: any) {
      if (isQuotaError(error)) {
        alert('Cota da API OpenRouter excedida (429). Aguarde alguns minutos.');
      } else {
        alert(`Erro: ${error?.message || 'Erro desconhecido'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const generateEmailContent = async (draft: EmailDraft, index: number) => {
    setDrafts(prev => {
      const nd = [...prev];
      nd[index] = { ...nd[index], status: 'generating', subject: 'Gerando...', body: 'Gerando conteúdo...' };
      return nd;
    });
    try {
      const main = draft.products[0];
      const textPrompt = draft.strategy === 'collection'
        ? `Role: Senior Direct Response Copywriter.
Products: ${draft.products.map(p => p.name).join(', ')}
${instructionsCollection}
Body in HTML (only <p> and <strong> tags, NO buttons or links).
Return JSON: { "subject": "string", "theme": "string", "body": "html string", "cta_text": "string" }`
        : `Role: Senior Direct Response Copywriter. Product: ${main.name}. Description: ${main.description}.
${instructionsSingle}
Body in HTML (only <p> and <strong> tags, NO buttons or links).
Return JSON: { "subject": "string", "body": "html string", "cta_text": "string" }`;

      const text = await generateWithRetry(() => openRouterChat(textPrompt));
      const content = JSON.parse(text || '{}');

      // Botão CTA padrão — template nosso, só o texto vem da IA
      const ctaHtml = `<div style="text-align:center;margin-top:24px;"><a href="${main.link}" style="display:inline-block;background:#10b981;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">${content.cta_text || 'Ver Produto'}</a></div>`;

      setDrafts(prev => {
        const nd = [...prev];
        nd[index] = {
          ...nd[index],
          subject: content.subject || 'Erro',
          body: (content.body || '') + ctaHtml,
          theme: content.theme || nd[index].theme,
          status: 'pending',
        };
        return nd;
      });
    } catch (e) {
      setDrafts(prev => {
        const nd = [...prev];
        nd[index] = {
          ...nd[index],
          subject: 'Erro na Geração',
          body: isQuotaError(e) ? 'Cota OpenRouter excedida (429). Aguarde.' : 'Falha ao gerar. Tente novamente.',
          status: 'pending',
        };
        return nd;
      });
    }
  };

  const handleGenerateImage = async (index: number) => {
    const draft = drafts[index];
    if (!draft) return;
    setGeneratingImages(prev => new Set(prev).add(index));
    try {
      const cleanName = draft.products[0].name.replace(/<[^>]*>/g, '').trim();
      const style = (clothingStyles[index] || '').trim() || 'camiseta';
      const hasRef = !!draft.products[0].image_link;
      const imagePrompt = hasRef
        ? imagePromptRef.replace('{style}', style)
        : imagePromptNoRef.replace('{style}', style).replace('{name}', cleanName);
      const url = await generateWithRetry(() => openRouterImage(imagePrompt, draft.products[0].image_link || undefined), 5, 5000);
      setDrafts(prev => {
        const nd = [...prev];
        nd[index] = { ...nd[index], generated_image: url };
        return nd;
      });
    } catch (e: any) {
      alert(`Erro ao gerar imagem: ${e.message}`);
    } finally {
      setGeneratingImages(prev => { const s = new Set(prev); s.delete(index); return s; });
    }
  };

  const handleApprove = async (index: number) => {
    const draft = drafts[index];
    if (draft.status !== 'pending') return;
    try {
      await addToLog({
        product_id: draft.products[0].id,
        product_name: draft.products[0].name,
        sent_date: draft.day,
        subject: draft.subject,
        body: draft.body,
      });
      setDrafts(prev => { const nd = [...prev]; nd[index].status = 'approved'; return nd; });
      loadLogs();
    } catch { alert('Falha ao salvar no log'); }
  };

  return (
    <div>
      {/* Sub-nav */}
      <div className="flex gap-2 mb-6">
        {(['input', 'drafts', 'log', 'config'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${view === v ? 'bg-slate-700 text-emerald-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            {v === 'config' && <Settings className="w-3.5 h-3.5" />}
            {v === 'input' ? 'Gerar' : v === 'drafts' ? 'Rascunhos' : v === 'log' ? 'Histórico' : 'Instruções IA'}
          </button>
        ))}
      </div>

      {view === 'input' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <FileText className="text-emerald-400" /> Nova Campanha
            </h2>
            <div className="space-y-6">
              {xmlContent ? (
                <p className="text-xs text-emerald-500 flex items-center gap-1">
                  {fetchingFeed ? <RefreshCw className="w-3 h-3 animate-spin" /> : '✓'} Feed carregado — {xmlContent.length.toLocaleString()} caracteres
                </p>
              ) : (
                <p className="text-xs text-amber-400">Feed não configurado. Acesse Configurações e informe a URL.</p>
              )}

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-400 mb-2">Dias para planejar</label>
                  <select
                    value={daysToGenerate}
                    onChange={e => setDaysToGenerate(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 text-slate-200"
                  >
                    {[1, 3, 5, 7].map(n => <option key={n} value={n}>{n} {n === 1 ? 'Dia' : 'Dias'}</option>)}
                  </select>
                </div>
                <button
                  onClick={handleAnalyze}
                  disabled={loading || !xmlContent}
                  className="flex-1 mt-7 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="animate-spin w-5 h-5" /> : <span className="flex items-center gap-2">Gerar Campanha <ChevronRight className="w-4 h-4" /></span>}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {view === 'drafts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="text-emerald-400" /> Agenda Proposta
            </h2>
            {drafts.map((draft, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedDraftIndex(idx)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedDraftIndex === idx ? 'bg-slate-800 border-emerald-800 ring-1 ring-emerald-800' :
                  draft.status === 'approved' ? 'bg-slate-900/50 border-green-900/50' :
                  'bg-slate-900 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-slate-500 uppercase">{draft.day}</span>
                  {draft.status === 'approved' && <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1"><Check className="w-3 h-3" /> Aprovado</span>}
                  {draft.status === 'generating' && <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Gerando</span>}
                </div>
                {draft.strategy === 'collection' && (
                  <span className="text-xs bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded-full border border-purple-900/50 mb-2 inline-block">
                    Coleção: {draft.theme}
                  </span>
                )}
                <h3 className="font-medium text-slate-200">{draft.products[0]?.name}
                  {draft.products.length > 1 && <span className="text-slate-500 text-sm ml-2">+{draft.products.length - 1}</span>}
                </h3>
                <p className="text-sm text-slate-500 mt-1 line-clamp-1">{draft.subject}</p>
                {draft.status !== 'approved' && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={e => { e.stopPropagation(); generateEmailContent(draft, idx); }} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Regenerar
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleApprove(idx); }} className="text-xs bg-emerald-900/40 hover:bg-emerald-800/40 text-emerald-200 border border-emerald-900 px-3 py-1.5 rounded-lg flex items-center gap-1 ml-auto">
                      <Check className="w-3 h-3" /> Aprovar
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Preview */}
          <div className="lg:sticky lg:top-24 h-fit">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Preview</h2>
              <div className="flex bg-slate-800 rounded-lg p-1">
                {(['visual', 'html'] as const).map(t => (
                  <button key={t} onClick={() => setPreviewTab(t)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${previewTab === t ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                    {t === 'visual' ? 'Visual' : 'HTML'}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white text-slate-900 rounded-xl overflow-hidden shadow-2xl min-h-96 flex flex-col">
              {drafts[selectedDraftIndex] ? (
                previewTab === 'visual' ? (
                  <div className="p-8 flex-1">
                    <div className="border-b border-slate-200 pb-4 mb-6">
                      <div className="text-xs text-slate-500 uppercase mb-1">Assunto</div>
                      <div className="text-xl font-bold text-slate-900">{drafts[selectedDraftIndex].subject}</div>
                    </div>
                    <div className="flex gap-2 mb-6">
                      <input
                        type="text"
                        value={clothingStyles[selectedDraftIndex] || ''}
                        onChange={e => setClothingStyles(prev => ({ ...prev, [selectedDraftIndex]: e.target.value }))}
                        placeholder="Estilo: oversized, hoodie, baby look..."
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                      <button
                        onClick={() => handleGenerateImage(selectedDraftIndex)}
                        disabled={generatingImages.has(selectedDraftIndex) || drafts[selectedDraftIndex].status === 'generating'}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 whitespace-nowrap"
                      >
                        {generatingImages.has(selectedDraftIndex) ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Gerar Imagem'}
                      </button>
                    </div>
                    {drafts[selectedDraftIndex].generated_image && (
                      <div className="mb-6 rounded-xl overflow-hidden shadow-lg">
                        <img src={drafts[selectedDraftIndex].generated_image} alt="AI" className="w-full h-auto" />
                      </div>
                    )}
                    <div className="prose prose-slate max-w-none prose-a:text-emerald-700" dangerouslySetInnerHTML={{ __html: drafts[selectedDraftIndex].body }} />
                    {drafts[selectedDraftIndex].strategy === 'collection' && drafts[selectedDraftIndex].products.length > 1 && (
                      <div className="mt-8 pt-6 border-t border-slate-200">
                        <h4 className="text-sm font-bold uppercase tracking-wide mb-4">Veja mais peças</h4>
                        <div className="grid grid-cols-3 gap-4">
                          {drafts[selectedDraftIndex].products.slice(1, 4).map((p, i) => (
                            <a key={i} href={p.link} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-2 p-2 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all text-center">
                              {p.image_link && <img src={p.image_link} alt={p.name} className="w-full aspect-square object-cover rounded-lg" referrerPolicy="no-referrer" />}
                              <div className="text-xs font-bold text-slate-900">{p.name}</div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  (() => {
                    const d = drafts[selectedDraftIndex];
                    const copy = (text: string) => navigator.clipboard.writeText(text);
                    const imageHtml = d.generated_image ? `<img src="${d.generated_image}" style="max-width:100%;border-radius:8px;margin-bottom:20px;">` : null;
                    const collectionHtml = d.strategy === 'collection' && d.products.length > 1
                      ? `<hr style="border:0;border-top:1px solid #e2e8f0;margin:30px 0;">
<h4 style="font-family:serif;text-transform:uppercase;font-size:14px;font-weight:bold;margin-bottom:16px;">VEJA MAIS PEÇAS</h4>
<table width="100%" cellpadding="0" cellspacing="0"><tr>
${d.products.slice(1, 4).map(p => `<td width="33%" style="padding:5px;vertical-align:top;text-align:center;"><a href="${p.link}" style="text-decoration:none;color:#1c1917;"><img src="${p.image_link}" style="width:100%;border-radius:8px;margin-bottom:8px;"><div style="font-size:12px;font-weight:bold;">${p.name}</div></a></td>`).join('')}
</tr></table>`
                      : null;
                    const sections = [
                      { label: 'Subject', content: d.subject },
                      ...(imageHtml ? [{ label: 'Imagem', content: imageHtml }] : []),
                      { label: 'Corpo', content: d.body },
                      ...(collectionHtml ? [{ label: 'Coleção', content: collectionHtml }] : []),
                    ];
                    return (
                      <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
                        {sections.map(({ label, content }) => (
                          <div key={label} className="flex flex-col">
                            <div className="flex justify-between items-center px-4 py-2 bg-slate-50 border-b border-slate-200">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</span>
                              <button onClick={() => copy(content)} className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1">
                                <Download className="w-3 h-3" /> Copiar
                              </button>
                            </div>
                            <pre className="p-4 font-mono text-xs text-slate-600 whitespace-pre-wrap break-all bg-white">{content}</pre>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 p-8">
                  Selecione um rascunho para visualizar
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'log' && (
        <div>
          <h2 className="text-xl font-bold mb-6">Histórico de Envios</h2>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400 font-medium border-b border-slate-700">
                <tr>
                  <th className="p-4">Data</th>
                  <th className="p-4">Produto</th>
                  <th className="p-4">Assunto</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="p-4 font-mono text-slate-500">{log.sent_date}</td>
                    <td className="p-4 font-medium text-slate-200">{log.product_name}</td>
                    <td className="p-4 text-slate-400">{log.subject}</td>
                    <td className="p-4 text-right">
                      <button onClick={() => { deleteLog(log.id); loadLogs(); }} className="text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-500">Nenhum envio registrado ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'config' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings className="text-emerald-400" /> Instruções para a IA
            </h2>

            {[
              {
                label: 'Instruções — E-mail Produto Único',
                hint: 'Tom, tamanho, estilo de escrita. Produto e descrição são inseridos automaticamente.',
                value: instructionsSingle,
                set: setInstructionsSingle,
                def: DEFAULT_INSTRUCTIONS_SINGLE,
              },
              {
                label: 'Instruções — E-mail Coleção',
                hint: 'Tom, tamanho, estilo de escrita. Lista de produtos é inserida automaticamente.',
                value: instructionsCollection,
                set: setInstructionsCollection,
                def: DEFAULT_INSTRUCTIONS_COLLECTION,
              },
              {
                label: 'Prompt — Imagem (com foto do produto)',
                hint: 'Variáveis disponíveis: {style}',
                value: imagePromptRef,
                set: setImagePromptRef,
                def: DEFAULT_IMAGE_PROMPT_REF,
              },
              {
                label: 'Prompt — Imagem (sem foto do produto)',
                hint: 'Variáveis disponíveis: {style}, {name}',
                value: imagePromptNoRef,
                set: setImagePromptNoRef,
                def: DEFAULT_IMAGE_PROMPT_NOREF,
              },
            ].map(({ label, hint, value, set, def }) => (
              <div key={label}>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-medium text-slate-300">{label}</label>
                  <button
                    onClick={() => set(def)}
                    className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
                    title="Restaurar padrão"
                  >
                    <RotateCcw className="w-3 h-3" /> Restaurar padrão
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-2 font-mono">{hint}</p>
                <textarea
                  value={value}
                  onChange={e => set(e.target.value)}
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-mono text-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none resize-y"
                />
              </div>
            ))}

            <button
              onClick={handleSaveConfig}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" /> Salvar Instruções
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
