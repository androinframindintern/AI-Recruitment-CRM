'use client';
import { useEffect } from 'react';
import { DangerButton, SecondaryButton } from './PrimaryButton';

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone and will permanently delete this data.',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isPending = false
}) {
  // Close on ESC key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isPending) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isPending]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (!isPending) onClose();
      }}
    >
      <div 
        className="w-full max-w-md bg-[#080d1a] border border-white/10 rounded-2xl p-6 shadow-2xl animate-scale-in relative overflow-hidden"
        style={{
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle top glow line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-amber-500" />
        
        <div className="flex items-start gap-4 mt-2">
          {/* Warning Icon Container */}
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed font-normal">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <SecondaryButton
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="px-4 py-2"
          >
            {cancelText}
          </SecondaryButton>
          <DangerButton
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="px-5 py-2 font-bold flex items-center gap-1.5"
          >
            {isPending && (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            )}
            {confirmText}
          </DangerButton>
        </div>
      </div>
    </div>
  );
}
