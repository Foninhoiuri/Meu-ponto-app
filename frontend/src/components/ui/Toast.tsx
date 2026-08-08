import { useEffect } from 'react';
import { twMerge } from 'tailwind-merge';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export const Toast = ({ 
  message, 
  type = 'info', 
  onClose, 
  duration = 4000 
}: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = {
    success: 'bg-success/90',
    error: 'bg-danger/90',
    info: 'bg-surface/90',
  }[type];

  return (
    <div className="fixed top-[calc(env(safe-area-inset-top,0px)_+_1rem)] left-4 right-4 z-[60] flex justify-center animate-slide-down">
      <div className={twMerge(
        'px-5 py-3.5 rounded-2xl shadow-xl backdrop-blur-xl max-w-sm w-full border border-white/10 flex items-center justify-between gap-3',
        bgColor
      )}>
        <p className="text-white font-medium text-sm">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white p-1">
          ✕
        </button>
      </div>
    </div>
  );
};
