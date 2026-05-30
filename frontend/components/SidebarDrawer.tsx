import { type ReactNode, useEffect } from 'react';
import { Link } from 'wouter';
import { isTauri } from '../lib/isTauri';

export function SidebarDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-40 md:hidden ${
        open ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close menu"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col overflow-y-auto border-l border-gray-200 bg-white shadow-2xl transition-transform duration-200 ease-out dark:border-gray-800 dark:bg-gray-950 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div
          className={`flex items-center justify-end gap-2 px-4 ${isTauri ? 'pt-12' : 'pt-4'}`}
        >
          <Link
            href="/settings"
            onClick={onClose}
            aria-label="Settings"
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <GearIcon />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            title="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 px-5 pb-8 pt-2">{children}</div>
      </aside>
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M11.49 3.17a.75.75 0 0 0-1.48 0l-.18 1.08a6 6 0 0 0-1.65.68l-.84-.7a.75.75 0 0 0-1.04 1.04l.7.84a6 6 0 0 0-.68 1.65l-1.08.18a.75.75 0 0 0 0 1.48l1.08.18c.13.59.36 1.14.68 1.65l-.7.84a.75.75 0 0 0 1.04 1.04l.84-.7c.51.32 1.06.55 1.65.68l.18 1.08a.75.75 0 0 0 1.48 0l.18-1.08a6 6 0 0 0 1.65-.68l.84.7a.75.75 0 0 0 1.04-1.04l-.7-.84a6 6 0 0 0 .68-1.65l1.08-.18a.75.75 0 0 0 0-1.48l-1.08-.18a6 6 0 0 0-.68-1.65l.7-.84a.75.75 0 0 0-1.04-1.04l-.84.7a6 6 0 0 0-1.65-.68l-.18-1.08ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 0 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
