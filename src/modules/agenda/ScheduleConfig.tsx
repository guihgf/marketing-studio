import { useState, useEffect } from 'react';
import type { ScheduleConfig, TimeSlot } from '../../types';
import { getSetting, saveSetting, refreshInstagramToken } from '../../api';
import { Clock, Star, Trash2, Plus, Instagram, CheckCircle, Loader2, Eye, EyeOff, RefreshCw } from 'lucide-react';

interface Props {
  config: ScheduleConfig;
  setConfig: React.Dispatch<React.SetStateAction<ScheduleConfig>>;
}

const generateId = () => Math.random().toString(36).slice(2, 9);

export default function ScheduleConfigView({ config, setConfig }: Props) {
  const [newTime, setNewTime] = useState('12:00');

  // Instagram settings
  const [igToken,     setIgToken]     = useState('');
  const [igUserId,    setIgUserId]    = useState('');
  const [igBaseUrl,   setIgBaseUrl]   = useState('');
  const [igAppId,     setIgAppId]     = useState('');
  const [igAppSecret, setIgAppSecret] = useState('');
  const [showToken,   setShowToken]   = useState(false);
  const [showSecret,  setShowSecret]  = useState(false);
  const [igLoading,   setIgLoading]   = useState(true);
  const [igSaving,    setIgSaving]    = useState(false);
  const [igSaved,     setIgSaved]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [refreshMsg,  setRefreshMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [token, userId, baseUrl, appId, appSecret] = await Promise.all([
        getSetting('instagram_access_token'),
        getSetting('instagram_user_id'),
        getSetting('instagram_base_url'),
        getSetting('facebook_app_id'),
        getSetting('facebook_app_secret'),
      ]);
      setIgToken(token || '');
      setIgUserId(userId || '');
      setIgBaseUrl(baseUrl || '');
      setIgAppId(appId || '');
      setIgAppSecret(appSecret || '');
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
      saveSetting('facebook_app_id',        igAppId.trim()),
      saveSetting('facebook_app_secret',    igAppSecret.trim()),
    ]);
    setIgSaving(false);
    setIgSaved(true);
    setTimeout(() => setIgSaved(false), 2500);
  };

  const handleRefreshToken = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const { expiresInDays, newToken } = await refreshInstagramToken();
      setIgToken(newToken);
      setRefreshMsg({ ok: true, text: `Token renovado! Válido por ~${expiresInDays} dias.` });
    } catch (e: any) {
      setRefreshMsg({ ok: false, text: e.message });
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(null), 8000);
    }
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

            {/* App ID + App Secret */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Facebook App ID</label>
                <input
                  type="text"
                  value={igAppId}
                  onChange={e => setIgAppId(e.target.value)}
                  placeholder="1234567890"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white text-sm focus:border-pink-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Facebook App Secret</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={igAppSecret}
                    onChange={e => setIgAppSecret(e.target.value)}
                    placeholder="abc123..."
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 pr-10 text-white text-sm focus:border-pink-500 outline-none font-mono"
                  />
                  <button type="button" onClick={() => setShowSecret(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 -mt-2">
              App ID e Secret em <span className="text-blue-400">developers.facebook.com/apps</span> → Configurações → Básico. Necessários para renovar o token.
            </p>

            {/* Botão Renovar Token */}
            <div className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-700 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300 font-medium">Renovar token (60 dias)</p>
                <p className="text-xs text-slate-500">Troca o token atual por um de longa duração sem precisar ir ao Graph Explorer.</p>
              </div>
              <button
                onClick={handleRefreshToken}
                disabled={refreshing || !igToken.trim() || !igAppId.trim() || !igAppSecret.trim()}
                className="shrink-0 flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {refreshing ? 'Renovando...' : 'Renovar'}
              </button>
            </div>
            {refreshMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg border ${refreshMsg.ok ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-red-950/40 border-red-500/30 text-red-300'}`}>
                {refreshMsg.text}
              </div>
            )}

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
