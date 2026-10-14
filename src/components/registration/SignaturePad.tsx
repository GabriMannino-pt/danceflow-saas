import { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Trash2 } from 'lucide-react';

export interface SignaturePadRef {
  clear: () => void;
  getSignatureData: () => string | null;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  onBegin?: () => void;
  onEnd?: () => void;
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(({ onBegin, onEnd }, ref) => {
  const sigCanvasRef = useRef<SignatureCanvas>(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      sigCanvasRef.current?.clear();
    },
    getSignatureData: () => {
      if (sigCanvasRef.current?.isEmpty()) {
        return null;
      }
      return sigCanvasRef.current?.getCanvas().toDataURL('image/png') || null;
    },
    isEmpty: () => {
      return sigCanvasRef.current?.isEmpty() ?? true;
    }
  }));

  // Handle canvas resize on mount and window resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = sigCanvasRef.current?.getCanvas();
      if (canvas && canvas.parentElement) {
        const rect = canvas.parentElement.getBoundingClientRect();
        // Save signature before resize to restore it if possible, 
        // though standard behavior is to reset for sizing.
        const isEmpty = sigCanvasRef.current?.isEmpty();
        if (canvas.width !== rect.width) {
          canvas.width = rect.width;
          canvas.height = 200;
          if (isEmpty) {
            sigCanvasRef.current?.clear();
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    const timer = setTimeout(handleResize, 200);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

  const handleClear = () => {
    sigCanvasRef.current?.clear();
  };

  return (
    <div className="space-y-2">
      <div className="relative border border-white/10 rounded-2xl bg-black/30 overflow-hidden h-[200px] touch-action-none">
        <SignatureCanvas
          ref={sigCanvasRef}
          penColor="#38bdf8" // sky blue for a sleek premium look
          canvasProps={{
            className: 'w-full h-full cursor-crosshair touch-action-none',
          }}
          onBegin={onBegin}
          onEnd={onEnd}
        />
        <button
          type="button"
          onClick={handleClear}
          className="absolute bottom-3 right-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors"
          title="Cancella firma"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <p className="text-[11px] text-white/40 text-center">
        Firma col dito o con il puntatore all'interno del riquadro.
      </p>
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';
