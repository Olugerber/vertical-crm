import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  disabled?: boolean;
  children: ReactNode;
}

export default function Modal({
  title, onClose, onConfirm,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  disabled = false,
  children,
}: ModalProps) {
  const btnClass = confirmVariant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'
    : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50';

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">{children}</div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={disabled}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${btnClass}`}
          >
            {disabled ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
