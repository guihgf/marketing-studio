import { useRef, useState } from 'react';

interface Props {
  onImageSelect: (base64: string) => void;
  selectedImage: string | null;
}

export const ImageUploader = ({ onImageSelect, selectedImage }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File | undefined) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => onImageSelect(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 transition-all text-center cursor-pointer relative overflow-hidden group
        ${isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600 hover:border-slate-400 bg-slate-800/50'}
        ${selectedImage ? 'h-64' : 'h-48'} flex flex-col items-center justify-center`}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
      onDrop={e => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files?.[0]); }}
    >
      <input type="file" ref={fileInputRef} onChange={e => processFile(e.target.files?.[0])} accept="image/*" className="hidden" />
      {selectedImage ? (
        <div className="relative w-full h-full">
          <img src={selectedImage} alt="Preview" className="w-full h-full object-contain rounded-lg" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
            <span className="text-white font-medium">Trocar Imagem</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center text-slate-400">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="font-bold text-lg">Arraste a foto da roupa aqui</p>
          <p className="text-sm mt-1">ou clique para selecionar</p>
        </div>
      )}
    </div>
  );
};
