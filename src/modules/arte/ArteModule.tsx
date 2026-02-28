import { useState, useMemo, useEffect } from 'react';
import { RefreshCw, Download, Wand2, Search, Upload, Rss, Link } from 'lucide-react';
import { ImageUploader } from './ImageUploader';
import { ThinkingLog } from './ThinkingLog';
import type { GeneratedStory, Product, Collection } from '../../types';
import { parseXML } from '../../utils/parseXML';
import { fetchImageAsBase64, getCollections, addArtToCollection, uploadFromUrl } from '../../api';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const planScene = async (imageBase64: string, context: string, aspectRatio: '9:16' | '1:1'): Promise<{ sceneDescription: string; thinkingProcess: string }> => {
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
        content: [
          { type: 'image_url', image_url: { url: imageBase64 } },
          {
            type: 'text',
            text: `You are a fashion photography art director for a geek/gamer apparel brand.

The user wants a ${aspectRatio === '9:16' ? 'vertical Instagram Story (9:16)' : 'square Instagram Post (1:1)'} lifestyle photo of a person wearing this t-shirt.

User's instruction: "${context}"

Write a complete image generation prompt (2-3 sentences) describing:
1. The full scene exactly as the user described — who, where, doing what
2. Photography style: camera angle, lens, lighting, mood
3. End with: "wearing a graphic t-shirt with the print clearly visible"

RULES:
- Follow the user's instruction literally — if they say "shopping mall with friends", describe that scene
- NEVER mention copyrighted IPs or brand names — describe visual aesthetics instead
- This should look like a candid lifestyle photo, NOT a studio product shot

Return JSON: { "thinkingProcess": "brief reasoning...", "sceneDescription": "the complete image prompt..." }`
          }
        ]
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = err?.error;
    const detail = e?.metadata?.raw ? ` — ${e.metadata.raw}` : '';
    throw new Error((e?.message || `Planning error: ${res.status}`) + detail);
  }
  const data = await res.json();
  const content = data.choices[0].message.content;
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { sceneDescription: content, thinkingProcess: '' };
  }
};

const generateImage = async (referenceImage: string, sceneDescription: string, aspectRatio: '9:16' | '1:1'): Promise<string> => {
  const prompt = `${sceneDescription}. The subject is wearing the exact t-shirt from the reference image — the print design must be clearly visible on the garment. Lifestyle fashion photo, not a product shot. Photo-realistic, high quality, professional photography.`;
  const imageSize = aspectRatio === '9:16' ? { width: 576, height: 1024 } : { width: 1024, height: 1024 };
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'black-forest-labs/flux.2-pro',
      modalities: ['image'],
      image_size: imageSize,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: referenceImage } },
        { type: 'text', text: prompt },
      ]}],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = err?.error;
    const detail = e?.metadata?.raw ? ` — ${e.metadata.raw}` : '';
    throw new Error((e?.message || `Image error: ${res.status}`) + detail);
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

interface ArteModuleProps {
  xmlContent: string;
}

export default function ArteModule({ xmlContent }: ArteModuleProps) {
  const [sourceTab, setSourceTab] = useState<'upload' | 'feed'>('upload');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [feedSearch, setFeedSearch] = useState('');
  const [context, setContext] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1'>('9:16');
  const [status, setStatus] = useState<'idle' | 'planning' | 'generating' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [story, setStory] = useState<GeneratedStory | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [linkCollectionId, setLinkCollectionId] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkedMsg, setLinkedMsg] = useState<string | null>(null);

  useEffect(() => { getCollections().then(setCollections); }, []);

  const feedProducts = useMemo(() => (xmlContent ? parseXML(xmlContent) : []), [xmlContent]);

  const filteredProducts = useMemo(() => {
    if (!feedSearch.trim()) return feedProducts.slice(0, 20);
    const q = feedSearch.toLowerCase();
    return feedProducts.filter(p => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [feedProducts, feedSearch]);

  // Active image: from upload or from selected feed product
  const activeImage = sourceTab === 'upload' ? selectedImage : selectedProduct?.image_link || null;

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    if (!context) setContext(product.name);
  };

  const handleLinkToCollection = async () => {
    if (!story?.imageUrl || !linkCollectionId) return;
    setLinking(true);
    try {
      const localUrl = await uploadFromUrl(story.imageUrl);
      await addArtToCollection(linkCollectionId, {
        id: `arte-${Date.now()}`,
        imageUrl: localUrl,
        description: context,
      });
      const col = collections.find(c => c.id === linkCollectionId);
      setLinkedMsg(`Vinculado à coleção "${col?.name}"!`);
    } catch (e: any) {
      setLinkedMsg(`Erro: ${e.message}`);
    } finally {
      setLinking(false);
    }
  };

  const handleGenerate = async () => {
    if (!activeImage || !context) return;
    try {
      setErrorMsg(null);
      setStory(null);
      setLinkedMsg(null);
      setStatus('planning');

      // Converte para base64 via proxy (Gemini não consegue acessar CDNs restritos por URL)
      const imageBase64 = (sourceTab === 'feed' && selectedProduct?.image_link)
        ? await fetchImageAsBase64(selectedProduct.image_link)
        : activeImage!;

      const plan = await planScene(imageBase64, context, aspectRatio);
      setStory({ imageUrl: '', promptUsed: plan.sceneDescription, thinkingProcess: plan.thinkingProcess });

      setStatus('generating');
      // FLUX recebe a imagem de referência para preservar a estampa — igual ao módulo de e-mail
      const imageUrl = await generateImage(imageBase64, plan.sceneDescription, aspectRatio);
      setStory(prev => prev ? { ...prev, imageUrl } : null);
      setStatus('done');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Erro desconhecido.');
    }
  };

  const downloadImage = () => {
    if (!story?.imageUrl) return;
    const link = document.createElement('a');
    link.href = story.imageUrl;
    link.download = `arte-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isLoading = status === 'planning' || status === 'generating';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Controls */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="text-emerald-400">1.</span> Selecionar Peça
          </h2>

          {/* Source tabs */}
          <div className="flex bg-slate-900 rounded-lg p-1 mb-4">
            <button
              onClick={() => setSourceTab('upload')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                sourceTab === 'upload' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-4 h-4" /> Upload
            </button>
            <button
              onClick={() => setSourceTab('feed')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                sourceTab === 'feed' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Rss className="w-4 h-4" /> Do Feed
              {feedProducts.length > 0 && (
                <span className="text-xs bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded-full">
                  {feedProducts.length}
                </span>
              )}
            </button>
          </div>

          {sourceTab === 'upload' ? (
            <ImageUploader selectedImage={selectedImage} onImageSelect={setSelectedImage} />
          ) : (
            <div className="space-y-3">
              {feedProducts.length === 0 ? (
                <p className="text-sm text-amber-400 text-center py-4">
                  Feed não carregado. Configure a URL em Configurações.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={feedSearch}
                      onChange={e => setFeedSearch(e.target.value)}
                      placeholder="Buscar produto..."
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-slate-600"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                    {filteredProducts.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleSelectProduct(product)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                          selectedProduct?.id === product.id
                            ? 'bg-emerald-900/40 border border-emerald-800'
                            : 'hover:bg-slate-700 border border-transparent'
                        }`}
                      >
                        {product.image_link ? (
                          <img
                            src={product.image_link}
                            alt={product.name}
                            className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-slate-700"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-slate-700 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-200 truncate">{product.name}</div>
                          {product.price && (
                            <div className="text-xs text-slate-500">{product.price}</div>
                          )}
                        </div>
                        {selectedProduct?.id === product.id && (
                          <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-4">Nenhum produto encontrado.</p>
                    )}
                  </div>

                  {selectedProduct && (
                    <div className="flex items-center gap-2 p-2 bg-emerald-900/20 border border-emerald-900/50 rounded-lg">
                      {selectedProduct.image_link && (
                        <img
                          src={selectedProduct.image_link}
                          alt={selectedProduct.name}
                          className="w-8 h-8 rounded object-cover flex-shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <span className="text-xs text-emerald-300 truncate">{selectedProduct.name}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span className="text-emerald-400">2.</span> Detalhes & Formato
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Formato</label>
            <div className="grid grid-cols-2 gap-3">
              {(['9:16', '1:1'] as const).map(ratio => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-all ${
                    aspectRatio === ratio
                      ? 'border-emerald-500 bg-emerald-500/20 text-white'
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <div className={ratio === '9:16' ? 'w-3 h-5 border-2 border-current rounded-sm' : 'w-5 h-5 border-2 border-current rounded-sm'} />
                  <span className="font-bold text-sm">{ratio === '9:16' ? 'STORY (9:16)' : 'POST (1:1)'}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Contexto</label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Descreva o cenário, mensagem ou cupom. Ex: cidade neon futurista distópica, use cupom GAMER50..."
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none h-28 placeholder:text-slate-600"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={!activeImage || !context || isLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isLoading
              ? <><RefreshCw size={18} className="animate-spin" /> {status === 'planning' ? 'Planejando...' : 'Gerando Arte...'}</>
              : <><Wand2 size={18} /> Gerar Arte</>}
          </button>

          {errorMsg && (
            <div className="p-3 bg-red-900/30 border border-red-500/50 rounded text-red-200 text-sm">{errorMsg}</div>
          )}
        </div>

        {story?.thinkingProcess && <ThinkingLog content={story.thinkingProcess} />}
      </div>

      {/* Preview */}
      <div className="lg:col-span-7 flex flex-col items-center">
        <div className="sticky top-24 w-full flex flex-col items-center">
          <div className={`relative w-full max-w-sm bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 group transition-all duration-500 ${
            aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-square'
          }`}>
            {story?.imageUrl ? (
              <img src={story.imageUrl} alt="Arte gerada" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-950">
                {isLoading ? (
                  <div className="animate-pulse flex flex-col items-center">
                    <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-emerald-400 font-bold">
                      {status === 'planning' ? 'PLANEJANDO COMPOSIÇÃO...' : 'GERANDO ARTE...'}
                    </p>
                    <p className="text-slate-500 text-sm mt-2">Formato {aspectRatio}</p>
                  </div>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-slate-800 rounded-2xl mb-4 flex items-center justify-center text-slate-600">
                      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-300">PREVIEW</h3>
                    <p className="text-slate-500 mt-2 text-sm">O resultado aparecerá aqui no formato {aspectRatio}.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {story?.imageUrl && (
            <div className="mt-6 w-full space-y-4">
              <div className="flex gap-4">
                <button onClick={downloadImage} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-5 rounded-lg flex items-center gap-2">
                  <Download size={16} /> Download
                </button>
                <button onClick={handleGenerate} disabled={isLoading} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold py-2 px-5 rounded-lg flex items-center gap-2 disabled:opacity-50">
                  <RefreshCw size={16} /> Gerar Novamente
                </button>
              </div>

              {aspectRatio === '9:16' && collections.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Link size={14} className="text-emerald-400" /> Vincular à Coleção da Agenda
                  </p>
                  <div className="flex gap-2">
                    <select
                      value={linkCollectionId}
                      onChange={e => { setLinkCollectionId(e.target.value); setLinkedMsg(null); }}
                      className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="">Selecione a coleção...</option>
                      {collections.filter(c => c.enabled).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleLinkToCollection}
                      disabled={!linkCollectionId || linking}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap"
                    >
                      {linking ? <RefreshCw size={14} className="animate-spin" /> : <Link size={14} />}
                      {linking ? 'Salvando...' : 'Vincular'}
                    </button>
                  </div>
                  {linkedMsg && (
                    <p className={`text-xs ${linkedMsg.startsWith('Erro') ? 'text-red-400' : 'text-emerald-400'}`}>
                      {linkedMsg}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
