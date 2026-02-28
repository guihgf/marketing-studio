import { useState, useEffect } from 'react';
import type { Collection, ScheduleConfig } from '../../types';
import { getCollections, getScheduleSlots, createCollection, updateCollection, deleteCollection, addArtToCollection, updateArt, deleteArt, createScheduleSlot, deleteScheduleSlot, uploadImages } from '../../api';
import CollectionManager from './CollectionManager';
import ScheduleConfigView from './ScheduleConfig';
import ScheduleView from './ScheduleView';
import { CalendarClock, Layers, LayoutDashboard, Loader2 } from 'lucide-react';

const INITIAL_CONFIG: ScheduleConfig = {
  slots: [
    { id: 'slot-1', time: '08:00', isPrime: false },
    { id: 'slot-2', time: '12:00', isPrime: true },
    { id: 'slot-3', time: '19:00', isPrime: true },
  ],
};

export default function AgendaModule() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'collections' | 'config'>('schedule');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [config, setConfig] = useState<ScheduleConfig>(INITIAL_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cols, slots] = await Promise.all([getCollections(), getScheduleSlots()]);
      setCollections(cols);
      if (slots.length > 0) setConfig({ slots });
    } catch (e) {
      console.error('Error loading agenda data', e);
    } finally {
      setLoading(false);
    }
  };

  // Persist collection changes to backend
  const handleSetCollections = async (updater: React.SetStateAction<Collection[]>) => {
    setCollections(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Sync changes in background
      syncCollections(prev, next);
      return next;
    });
  };

  const syncCollections = async (prev: Collection[], next: Collection[]) => {
    // Find added collections
    for (const col of next) {
      const existed = prev.find(c => c.id === col.id);
      if (!existed) {
        await createCollection({ id: col.id, name: col.name, link: col.link, priority: col.priority, enabled: col.enabled });
        for (const art of col.arts) {
          await addArtToCollection(col.id, art);
        }
      } else {
        // Check if collection metadata changed
        if (existed.name !== col.name || existed.link !== col.link || existed.priority !== col.priority || existed.enabled !== col.enabled) {
          await updateCollection(col.id, { name: col.name, link: col.link, priority: col.priority, enabled: col.enabled });
        }
        // Find added arts
        for (const art of col.arts) {
          if (!existed.arts.find(a => a.id === art.id)) {
            await addArtToCollection(col.id, art);
          } else {
            // Check if art changed
            const prevArt = existed.arts.find(a => a.id === art.id)!;
            if (prevArt.description !== art.description || prevArt.lastUsed !== art.lastUsed) {
              await updateArt(art.id, { description: art.description, lastUsed: art.lastUsed });
            }
          }
        }
        // Find removed arts
        for (const art of existed.arts) {
          if (!col.arts.find(a => a.id === art.id)) {
            await deleteArt(art.id);
          }
        }
      }
    }
    // Find removed collections
    for (const col of prev) {
      if (!next.find(c => c.id === col.id)) {
        await deleteCollection(col.id);
      }
    }
  };

  const handleSetConfig = async (updater: React.SetStateAction<ScheduleConfig>) => {
    setConfig(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncSlots(prev.slots, next.slots);
      return next;
    });
  };

  const syncSlots = async (prev: ScheduleConfig['slots'], next: ScheduleConfig['slots']) => {
    for (const slot of next) {
      if (!prev.find(s => s.id === slot.id)) {
        await createScheduleSlot({ ...slot, sortOrder: next.indexOf(slot) });
      }
    }
    for (const slot of prev) {
      if (!next.find(s => s.id === slot.id)) {
        await deleteScheduleSlot(slot.id);
      }
    }
  };

  const handleUploadImages = async (collectionId: string, files: File[]): Promise<string[]> => {
    return uploadImages(files);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-emerald-500 w-8 h-8" />
      </div>
    );
  }

  const tabs = [
    { id: 'schedule' as const, label: 'Agenda', icon: <CalendarClock size={16} /> },
    { id: 'collections' as const, label: 'Coleções', icon: <Layers size={16} /> },
    { id: 'config' as const, label: 'Config', icon: <LayoutDashboard size={16} /> },
  ];

  return (
    <div>
      {/* Sub-nav */}
      <div className="flex gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === tab.id ? 'bg-slate-700 text-emerald-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'schedule' && (
        <ScheduleView collections={collections} config={config} setCollections={handleSetCollections} />
      )}
      {activeTab === 'collections' && (
        <CollectionManager collections={collections} setCollections={handleSetCollections} onUploadImages={handleUploadImages} />
      )}
      {activeTab === 'config' && (
        <ScheduleConfigView config={config} setConfig={handleSetConfig} />
      )}
    </div>
  );
}
