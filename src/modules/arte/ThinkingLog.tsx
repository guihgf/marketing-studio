import { useState } from 'react';
import { ChevronDown, Lightbulb } from 'lucide-react';

export const ThinkingLog = ({ content }: { content: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!content) return null;

  return (
    <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 flex items-center justify-between text-yellow-500 hover:bg-yellow-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lightbulb size={16} />
          <span className="font-bold uppercase tracking-wider text-sm">Raciocínio da IA</span>
        </div>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-4 py-3 text-sm text-yellow-100/80 font-mono whitespace-pre-wrap border-t border-yellow-500/20 bg-black/20">
          {content}
        </div>
      )}
    </div>
  );
};
