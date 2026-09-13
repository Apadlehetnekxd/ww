import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function VisionSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="vision-sheet" aria-labelledby="vision-sheet-title" onCancel={onClose} onClick={event => {
      if (event.target !== ref.current) return;
      const box = ref.current.getBoundingClientRect();
      if (event.clientY < box.top || event.clientX < box.left || event.clientX > box.right) onClose();
    }}>
      <div className="vision-sheet-handle" aria-hidden="true" />
      <div className="vision-sheet-heading">
        <h2 id="vision-sheet-title">{title}</h2>
        <button type="button" className="vision-icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button>
      </div>
      {children}
    </dialog>
  );
}
