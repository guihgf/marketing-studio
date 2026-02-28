import { useState } from 'react';
import type { ScheduleConfig, TimeSlot } from '../../types';
import { Clock, Star, Trash2, Plus } from 'lucide-react';

interface Props {
  config: ScheduleConfig;
  setConfig: React.Dispatch<React.SetStateAction<ScheduleConfig>>;
}

const generateId = () => Math.random().toString(36).slice(2, 9);

export default function ScheduleConfigView({ config, setConfig }: Props) {
  const [newTime, setNewTime] = useState('12:00');

  const addSlot = () => {
    const newSlot: TimeSlot = { id: generateId(), time: newTime, isPrime: false };
    const slots = [...config.slots, newSlot].sort((a, b) => a.time.localeCompare(b.time));
    setConfig({ ...config, slots });
  };

  const removeSlot = (id: string) => setConfig({ ...config, slots: config.slots.filter(s => s.id !== id) });
  const togglePrime = (id: string) => setConfig({ ...config, slots: config.slots.map(s => s.id === id ? { ...s, isPrime: !s.isPrime } : s) });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
    </div>
  );
}
