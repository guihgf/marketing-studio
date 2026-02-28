import { useState, useRef } from 'react';
import type { Collection, Art, Priority } from '../../types';
import { Trash2, Plus, Image as ImageIcon, ExternalLink, Star, Upload, Loader2 } from 'lucide-react';

const generateId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

interface Props {
  collections: Collection[];
  setCollections: React.Dispatch<React.SetStateAction<Collection[]>>;
  onUploadImages: (collectionId: string, files: File[]) => Promise<string[]>;
}

export default function CollectionManager({ collections, setCollections, onUploadImages }: Props) {
  const [newName, setNewName] = useState('');
  const [newLink, setNewLink] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('MEDIUM');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingIdRef = useRef<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const addCollection = () => {
    if (!newName) return;
    const newCol: Collection = {
      id: generateId(),
      name: newName,
      link: newLink || '#',
      priority: newPriority,
      enabled: true,
      arts: [],
    };
    setCollections(prev => [...prev, newCol]);
    setNewName('');
    setNewLink('');
  };

  const removeCollection = (id: string) => {
    if (window.confirm('Apagar esta coleção e todas as suas artes?')) {
      setCollections(prev => prev.filter(c => c.id !== id));
    }
  };

  const toggleCollection = (id: string) =>
    setCollections(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));

  const triggerUpload = (collectionId: string) => {
    uploadingIdRef.current = collectionId;
    if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const targetId = uploadingIdRef.current;
    if (!files.length || !targetId) return;

    setIsProcessing(true);
    try {
      setUploadProgress(`Enviando ${files.length} imagem(ns)...`);
      const urls = await onUploadImages(targetId, files);
      const newArts: Art[] = urls.map((url, i) => ({
        id: generateId(),
        collectionId: targetId,
        imageUrl: url,
        description: files[i]?.name.split('.')[0].replace(/[-_]/g, ' ') || 'Arte',
        lastUsed: null,
      }));
      setCollections(prev => prev.map(c => c.id === targetId ? { ...c, arts: [...c.arts, ...newArts] } : c));
    } catch (err) {
      alert('Erro ao fazer upload das imagens.');
      console.error(err);
    } finally {
      setIsProcessing(false);
      setUploadProgress('');
      uploadingIdRef.current = null;
    }
  };

  const removeArt = (collectionId: string, artId: string) =>
    setCollections(prev => prev.map(c => c.id === collectionId ? { ...c, arts: c.arts.filter(a => a.id !== artId) } : c));

  const updateArtDesc = (collectionId: string, artId: string, desc: string) =>
    setCollections(prev => prev.map(c => c.id === collectionId ? { ...c, arts: c.arts.map(a => a.id === artId ? { ...a, description: desc } : a) } : c));

  const priorityColors: Record<Priority, string> = {
    HIGH: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    MEDIUM: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    LOW: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };
  const priorityLabel: Record<Priority, string> = { HIGH: 'ALTA', MEDIUM: 'MÉDIA', LOW: 'BAIXA' };

  return (
    <div className="space-y-8">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" multiple />

      {/* Add new */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Plus className="text-emerald-400" /> Nova Coleção</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="text" placeholder="Nome da coleção" value={newName} onChange={e => setNewName(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 md:col-span-2" />
          <input type="text" placeholder="Link (opcional)" value={newLink} onChange={e => setNewLink(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500" />
          <select value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)}
            className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500">
            <option value="LOW">Baixa Prioridade</option>
            <option value="MEDIUM">Média Prioridade</option>
            <option value="HIGH">Alta Prioridade</option>
          </select>
          <button onClick={addCollection} disabled={!newName}
            className="md:col-span-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-lg transition-colors">
            Adicionar
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-6">
        {collections.length === 0 && (
          <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
            <ImageIcon className="mx-auto h-12 w-12 text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-slate-300">Nenhuma coleção</h3>
            <p className="text-slate-500">Adicione uma coleção acima para começar.</p>
          </div>
        )}

        {collections.map(col => (
          <div key={col.id} className={`bg-slate-800 rounded-xl border overflow-hidden ${col.priority === 'HIGH' ? 'border-purple-500/50' : 'border-slate-700'}`}>
            <div className="p-4 bg-slate-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button onClick={() => toggleCollection(col.id)}
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${col.enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-slate-600'}`}>
                  {col.enabled && <div className="w-2 h-2 bg-white rounded-full" />}
                </button>
                <div>
                  <h4 className="font-bold text-white">{col.name}</h4>
                  <a href={col.link} target="_blank" rel="noreferrer" className="text-sm text-slate-400 hover:text-emerald-400 flex items-center gap-1">
                    {col.link} <ExternalLink size={12} />
                  </a>
                </div>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 ${priorityColors[col.priority]}`}>
                  {col.priority === 'HIGH' && <Star size={10} fill="currentColor" />}
                  {priorityLabel[col.priority]}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => triggerUpload(col.id)} disabled={isProcessing}
                  className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg border border-slate-600 disabled:opacity-50">
                  {isProcessing && uploadingIdRef.current === col.id ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {isProcessing && uploadingIdRef.current === col.id ? uploadProgress : 'Adicionar Artes'}
                </button>
                <button onClick={() => removeCollection(col.id)}
                  className="flex items-center gap-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="p-4">
              {col.arts.length === 0 ? (
                <div className="text-center py-6 text-slate-600 bg-slate-900/30 rounded-lg border border-dashed border-slate-700">
                  <ImageIcon className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma arte. Clique em "Adicionar Artes".</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {col.arts.map(art => (
                    <div key={art.id} className="group relative aspect-[9/16] bg-slate-900 rounded-lg overflow-hidden border border-slate-700 hover:border-emerald-500/50 transition-colors">
                      <img src={art.imageUrl} alt="Art" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />
                      <div className="absolute bottom-0 left-0 right-0 p-2 z-10">
                        <input type="text" value={art.description} onChange={e => updateArtDesc(col.id, art.id, e.target.value)}
                          className="w-full bg-transparent text-[10px] text-white border-b border-transparent focus:border-emerald-500 outline-none truncate" />
                        {art.lastUsed && (
                          <p className="text-[9px] text-orange-400 font-medium">{new Date(art.lastUsed).toLocaleDateString('pt-BR')}</p>
                        )}
                      </div>
                      <button onClick={() => removeArt(col.id, art.id)}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all z-20">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
