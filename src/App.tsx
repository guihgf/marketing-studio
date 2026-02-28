import { useState, useEffect } from 'react';
import { Mail, Image, CalendarDays, Zap, Settings, RefreshCw, Download, Save, LogOut } from 'lucide-react';
import EmailModule from './modules/email/EmailModule';
import ArteModule from './modules/arte/ArteModule';
import AgendaModule from './modules/agenda/AgendaModule';
import LoginPage from './modules/auth/LoginPage';
import { getSetting, saveSetting, fetchFeedProxy } from './api';

type Module = 'email' | 'arte' | 'agenda' | 'settings';

const tabs: { id: Module; label: string; icon: React.ReactNode }[] = [
  { id: 'email', label: 'E-mail', icon: <Mail size={16} /> },
  { id: 'arte', label: 'Arte', icon: <Image size={16} /> },
  { id: 'agenda', label: 'Agenda', icon: <CalendarDays size={16} /> },
];

function AppContent({ userEmail, onLogout }: { userEmail: string; onLogout: () => void }) {
  const [activeModule, setActiveModule] = useState<Module>('email');
  const [feedUrl, setFeedUrl] = useState('');
  const [xmlContent, setXmlContent] = useState('');
  const [fetchingFeed, setFetchingFeed] = useState(false);

  useEffect(() => {
    getSetting('feed_url').then(async v => {
      if (!v) return;
      setFeedUrl(v);
      setFetchingFeed(true);
      try {
        setXmlContent(await fetchFeedProxy(v));
      } catch { /* silencioso */ }
      finally { setFetchingFeed(false); }
    });
  }, []);

  const handleSaveFeedUrl = async () => {
    if (!feedUrl) return;
    await saveSetting('feed_url', feedUrl);
    alert('URL salva!');
  };

  const refreshFeed = async (): Promise<string> => {
    if (!feedUrl) return xmlContent;
    setFetchingFeed(true);
    try {
      const xml = await fetchFeedProxy(feedUrl);
      setXmlContent(xml);
      return xml;
    } catch { return xmlContent; }
    finally { setFetchingFeed(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-lg">
              <Zap className="text-slate-900" size={20} strokeWidth={3} />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent hidden sm:block">
              Marketing Studio
            </h1>
          </div>

          <div className="flex gap-1 items-center">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveModule(tab.id)}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeModule === tab.id
                    ? 'bg-slate-800 text-emerald-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <button
              onClick={() => setActiveModule('settings')}
              className={`p-2 rounded-lg transition-colors ${
                activeModule === 'settings'
                  ? 'bg-slate-800 text-emerald-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              title="Configurações"
            >
              <Settings size={16} />
            </button>
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <button
              onClick={onLogout}
              title={`Sair (${userEmail})`}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800/50 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {activeModule === 'email' && (
          <EmailModule
            xmlContent={xmlContent}
            refreshFeed={refreshFeed}
            fetchingFeed={fetchingFeed}
          />
        )}
        {activeModule === 'arte' && <ArteModule xmlContent={xmlContent} />}
        {activeModule === 'agenda' && <AgendaModule />}

        {activeModule === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings className="text-emerald-400" size={20} /> Configurações Gerais
            </h2>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Feed de Produtos</h3>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">URL do Feed XML</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={feedUrl}
                    onChange={e => setFeedUrl(e.target.value)}
                    placeholder="https://loja.com/feed.xml"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    onClick={() => refreshFeed()}
                    disabled={fetchingFeed || !feedUrl}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {fetchingFeed ? <RefreshCw className="animate-spin w-4 h-4" /> : <Download className="w-4 h-4" />}
                    Buscar
                  </button>
                  <button
                    onClick={handleSaveFeedUrl}
                    disabled={!feedUrl}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                    title="Salvar URL"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </div>
                {xmlContent ? (
                  <p className="text-xs text-emerald-500 mt-2">
                    ✓ Feed carregado — {xmlContent.length.toLocaleString()} caracteres
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-2">Nenhum feed carregado ainda.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('auth_email') || '');

  const handleLogin = (t: string, email: string) => {
    localStorage.setItem('auth_token', t);
    localStorage.setItem('auth_email', email);
    setToken(t);
    setUserEmail(email);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_email');
    setToken(null);
    setUserEmail('');
  };

  if (!token) return <LoginPage onLogin={handleLogin} />;
  return <AppContent userEmail={userEmail} onLogout={handleLogout} />;
}
