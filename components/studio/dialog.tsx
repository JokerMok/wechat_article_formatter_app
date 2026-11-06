"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function StudioDialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`studio-dialog ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="studio-dialog-inner">
        <header>
          <h2>{title}</h2>
          <button aria-label="关闭面板" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
