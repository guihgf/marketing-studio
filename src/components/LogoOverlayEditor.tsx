import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Download, Image as ImageIcon } from 'lucide-react';
import { fetchImageAsBase64 } from '../api';

interface Props {
  imageUrl: string;
  logoUrl: string;
  onDownloadOriginal: () => void;
  /** When provided, controls are portaled into this element instead of rendered inline. */
  externalControlsTarget?: HTMLElement | null;
  /** When true (default), image uses h-full + object-cover to fill a fixed-height container. */
  fillContainer?: boolean;
  /** When provided, both exports apply center-crop to match the displayed format. */
  aspectRatio?: '9:16' | '1:1';
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/** Returns the center-crop region that matches `object-cover` behaviour for a given target AR. */
function centerCrop(srcW: number, srcH: number, targetAR: number) {
  const srcAR = srcW / srcH;
  if (srcAR > targetAR) {
    const sw = Math.round(srcH * targetAR);
    return { sx: Math.round((srcW - sw) / 2), sy: 0, sw, sh: srcH };
  } else {
    const sh = Math.round(srcW / targetAR);
    return { sx: 0, sy: Math.round((srcH - sh) / 2), sw: srcW, sh };
  }
}

function drawColoredLogo(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const [r, g, b] = hexToRgb(color);
  for (let i = 0; i < data.data.length; i += 4) {
    if (data.data[i + 3] > 0) {
      data.data[i] = r;
      data.data[i + 1] = g;
      data.data[i + 2] = b;
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

export default function LogoOverlayEditor({
  imageUrl,
  logoUrl,
  onDownloadOriginal,
  externalControlsTarget,
  fillContainer = true,
  aspectRatio,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  const [pos, setPos] = useState({ x: 50, y: 85 });
  const [logoColor, setLogoColor] = useState('#ffffff');
  const [logoSize, setLogoSize] = useState(25);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!logoUrl || !logoCanvasRef.current) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = logoUrl;
    img.onload = () => {
      logoImgRef.current = img;
      const colored = drawColoredLogo(img, logoColor);
      const canvas = logoCanvasRef.current!;
      // Render at ≥600px wide (or 2× DPR) so CSS downscale is always sharp
      const minW = Math.max(600, img.naturalWidth * (window.devicePixelRatio || 2));
      const scale = minW / img.naturalWidth;
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(colored, 0, 0, canvas.width, canvas.height);
    };
  }, [logoUrl, logoColor]);

  const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

  const updatePos = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = clientX - dragStartRef.current.mouseX;
    const dy = clientY - dragStartRef.current.mouseY;
    setPos({
      x: clamp(dragStartRef.current.posX + (dx / rect.width) * 100),
      y: clamp(dragStartRef.current.posY + (dy / rect.height) * 100),
    });
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, posX: pos.x, posY: pos.y };
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    isDraggingRef.current = true;
    dragStartRef.current = { mouseX: t.clientX, mouseY: t.clientY, posX: pos.x, posY: pos.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (isDraggingRef.current) updatePos(e.clientX, e.clientY); };
    const onUp = () => { isDraggingRef.current = false; };
    const onTouchMove = (e: TouchEvent) => { if (isDraggingRef.current) updatePos(e.touches[0].clientX, e.touches[0].clientY); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [updatePos]);

  const exportWithLogo = async () => {
    if (!logoImgRef.current) return;
    setExporting(true);
    try {
      const bgBase64 = imageUrl.startsWith('data:') ? imageUrl : await fetchImageAsBase64(imageUrl).catch(async () => {
        const res = await fetch(imageUrl);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        bytes.forEach(b => bin += String.fromCharCode(b));
        return `data:image/png;base64,${btoa(bin)}`;
      });

      await new Promise<void>((resolve, reject) => {
        const bgImg = new Image();
        bgImg.onload = () => {
          // Apply the same center-crop that object-cover does in the preview
          const targetAR = aspectRatio === '9:16' ? 9 / 16 : aspectRatio === '1:1' ? 1 : null;
          const { sx, sy, sw, sh } = targetAR
            ? centerCrop(bgImg.naturalWidth, bgImg.naturalHeight, targetAR)
            : { sx: 0, sy: 0, sw: bgImg.naturalWidth, sh: bgImg.naturalHeight };

          const canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, sw, sh);

          const logoColored = drawColoredLogo(logoImgRef.current!, logoColor);
          const logoW = (logoSize / 100) * sw;
          const logoH = logoW * (logoColored.height / logoColored.width);
          const lx = (pos.x / 100) * sw - logoW / 2;
          const ly = (pos.y / 100) * sh - logoH / 2;
          ctx.drawImage(logoColored, lx, ly, logoW, logoH);
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('Export failed')); return; }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `arte-com-logo-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(a.href);
            resolve();
          }, 'image/png');
        };
        bgImg.onerror = reject;
        bgImg.src = bgBase64;
      });
    } catch (e) {
      console.error('Export error', e);
      alert('Erro ao exportar. Tente o download sem logo.');
    } finally {
      setExporting(false);
    }
  };

  const imgClass = fillContainer ? 'w-full h-full object-cover' : 'w-full h-auto block';

  if (!logoUrl) {
    return (
      <div className={`relative group ${fillContainer ? 'w-full h-full' : 'w-full'}`}>
        <img src={imageUrl} alt="Arte gerada" className={imgClass} />
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onDownloadOriginal} className="bg-black/50 backdrop-blur text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Download size={12} /> Download
          </button>
        </div>
      </div>
    );
  }

  const controls = (
    <div className="logo-controls mt-3 space-y-2 px-1">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <ImageIcon size={12} /> Cor
          <input
            type="color"
            value={logoColor}
            onChange={e => setLogoColor(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-slate-600 bg-transparent"
            title="Cor do logo"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400 flex-1 min-w-24">
          Tamanho
          <input
            type="range"
            min={5}
            max={60}
            value={logoSize}
            onChange={e => setLogoSize(+e.target.value)}
            className="flex-1 accent-emerald-500"
          />
          <span className="w-8 text-right">{logoSize}%</span>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={exportWithLogo}
          disabled={exporting}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-2"
        >
          <Download size={14} /> {exporting ? 'Exportando...' : 'Com Logo'}
        </button>
        <button
          onClick={onDownloadOriginal}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-2"
        >
          <Download size={14} /> Sem Logo
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Image + draggable logo — fills parent (used inside overflow-hidden aspect-ratio container) */}
      <div
        ref={containerRef}
        className={`relative select-none ${fillContainer ? 'w-full h-full' : 'w-full'}`}
        style={{ userSelect: 'none' }}
      >
        <img src={imageUrl} alt="Arte gerada" className={imgClass} draggable={false} />

        <div
          style={{
            position: 'absolute',
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: 'translate(-50%, -50%)',
            width: `${logoSize}%`,
            cursor: isDraggingRef.current ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          <canvas
            ref={logoCanvasRef}
            style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
          />
        </div>
      </div>

      {/* Controls: portaled outside when externalControlsTarget is provided */}
      {externalControlsTarget
        ? createPortal(controls, externalControlsTarget)
        : controls}
    </>
  );
}
