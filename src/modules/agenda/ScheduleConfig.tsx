import { useState, useEffect } from 'react';
import type { ScheduleConfig, TimeSlot } from '../../types';
import { getSetting, saveSetting } from '../../api';
import { Clock, Star, Trash2, Plus, Instagram, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react';

interface Props {
  config: ScheduleConfig;
  setConfig: React.Dispatch<React.SetStateAction<ScheduleConfig>>;
}

const generateId = () => Math.random().toString(36).slice(2, 9);

export default function ScheduleConfigView({ config, setConfig }: Props) {
  const [newTime, setNewTime] = useState('12:00');

  // Instagram settings
  const [igToken,   setIgToken]   = useState('');
  const [igUserId,  setIgUserId]  = useState('');
  const [igBaseUrl, setIgBaseUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [igLoading, setIgLoading] = useState(true);
  const [igSaving,  setIgSaving]  = useState(false);
  const [igSaved,   setIgSaved]   = useState(false);

  useEffect(() => {
    (async () => {
      const [token, userId, baseUrl] = await Promise.all([
        getSetting('instagram_access_token'),
        getSetting('instagram_user_id'),
        getSetting('instagram_base_url'),
      ]);
      setIgToken(token || '');
      setIgUserId(userId || '');
      setIgBaseUrl(baseUrl || '');
      setIgLoading(false);
    })();
  }, []);

  const addSlot = () => {
    const newSlot: TimeSlot = { id: generateId(), time: newTime, isPrime: false };
    const slots = [...config.slots, newSlot].sort((a, b) => a.time.localeCompare(b.time));
    setConfig({ ...config, slots });
  };

  const removeSlot = (id: string) => setConfig({ ...config, slots: config.slots.filter(s => s.id !== id) });
  const togglePrime = (id: string) => setConfig({ ...config, slots: config.slots.map(s => s.id === id ? { ...s, isPrime: !s.isPrime } : s) });

  const saveInstagram = async () => {
    setIgSaving(true);
    await Promise.all([
      saveSetting('instagram_access_token', igToken.trim()),
      saveSetting('instagram_user_id',      igUserId.trim()),
      saveSetting('instagram_base_url',     igBaseUrl.trim()),
    ]);
    setIgSaving(false);
    setIgSaved(true);
    setTimeout(() => setIgSaved(false), 2500);
  };

  const isConfigured = igToken.trim() && igUserId.trim();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Horários */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Clock className="text-emerald-400" /> Configuração de Horários
        </h3>

        <div className="flex gap-4 mb-8 p-4 bg-slate-900 rounded-lg">
          <div className="flex-1">
            <label className="block text-slate-400 text-sm mb-2">Novo Horário</label>
            <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:border-emerald-500 outline-none" />
          </div>
          <div className="flex items-end">
            <button onClick={addSlot} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2">
              <Plus size={18} /> Adicionar
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {config.slots.map(slot => (
            <div key={slot.id} className={`flex items-center justify-between p-4 rounded-lg border ${slot.isPrime ? 'bg-purple-900/20 border-purple-500/50' : 'bg-slate-700/50 border-slate-600'}`}>
              <div className="flex items-center gap-4">
                <span className="text-2xl font-mono text-white">{slot.time}</span>
                {slot.isPrime && <span className="text-xs font-bold text-purple-400 bg-purple-500/20 px-2 py-1 rounded border border-purple-500/30">NOBRE</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => togglePrime(slot.id)} title={slot.isPrime ? 'Remover Nobre' : 'Tornar Nobre'}
                  className={`p-2 rounded-lg transition-colors ${slot.isPrime ? 'text-purple-400 hover:bg-purple-500/20' : 'text-slate-400 hover:text-purple-400'}`}>
                  <Star size={20} fill={slot.isPrime ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => removeSlot(slot.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-sm text-slate-500">Horários nobres priorizam coleções de alta prioridade.</p>
      </div>

      {/* Instagram */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Instagram className="text-pink-400" size={22} /> Instagram Graph API
          </h3>
          {!igLoading && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
              isConfigured
                ? 'bg-pink-900/30 border-pink-500/40 text-pink-300'
                : 'bg-slate-700 border-slate-600 text-slate-400'
            }`}>
              {isConfigured ? '● Configurado' : '○ Não configurado'}
            </span>
          )}
        </div>

        {igLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-slate-500" size={24} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Access Token */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Access Token</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={igToken}
                  onChange={e => setIgToken(e.target.value)}
                  placeholder="EAAxxxxxx..."
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 pr-10 text-white text-sm focus:border-pink-500 outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Gere em <span className="text-blue-400">developers.facebook.com/tools/explorer</span> com permissão <code className="bg-slate-900 px-1 rounded">instagram_content_publish</code>
              </p>
            </div>

            {/* User ID */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Instagram User ID</label>
              <input
                type="text"
                value={igUserId}
                onChange={e => setIgUserId(e.target.value)}
                placeholder="17841400..."
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white text-sm focus:border-pink-500 outline-none font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">ID numérico da conta Business/Creator vinculada à Facebook Page.</p>
            </div>

            {/* Base URL */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">URL pública do servidor</label>
              <input
                type="url"
                value={igBaseUrl}
                onChange={e => setIgBaseUrl(e.target.value)}
                placeholder="https://seudominio.com.br"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white text-sm focus:border-pink-500 outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">URL que o Instagram usa para acessar as imagens armazenadas (deve ser acessível externamente).</p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={saveInstagram}
                disabled={igSaving}
                className="flex items-center gap-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-lg text-sm transition-all"
              >
                {igSaved
                  ? <><CheckCircle size={16} /> Salvo!</>
                  : igSaving
                    ? <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                    : 'Salvar configurações'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
