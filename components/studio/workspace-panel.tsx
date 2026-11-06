"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";

const compactQuery = "(max-width: 1023px)";
function subscribe(listener: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
export function useCompactWorkspace() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(compactQuery).matches,
    () => false,
  );
}

export function WorkspacePanel({
  id,
  title,
  className,
  compact,
  open,
  onClose,
  actions,
  children,
}: {
  id: string;
  title: string;
  className: string;
  compact: boolean;
  open: boolean;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const panel = ref.current;
    if (!compact || !panel) return;
    if (open && !panel.open) panel.showModal();
    if (!open && panel.open) panel.close();
    return () => panel.close();
  }, [compact, open]);

  if (!compact)
    return (
      <aside id={id} aria-label={title} className={className} hidden={!open}>
        {children}
      </aside>
    );
  return (
    <dialog
      id={id}
      ref={ref}
      aria-label={title}
      className={`studio-panel-dialog ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const panel = event.currentTarget;
        const targets = Array.from(
          panel.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,a[href],summary,[tabindex]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            element.getClientRects().length > 0,
        );
        const first = targets[0],
          last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last &&
          first
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <header className="studio-panel-heading">
        <h2>{title}</h2>
        <div>
          {actions}
          <button
            className="studio-icon-btn"
            aria-label={`关闭${title}`}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <div className="studio-panel-body">{children}</div>
    </dialog>
  );
}

export function PanelToggle({
  label,
  controls,
  open,
  onClick,
  icon,
  compact,
}: {
  label: string;
  controls: string;
  open: boolean;
  onClick: () => void;
  icon: ReactNode;
  compact: boolean;
}) {
  return (
    <button
      className="studio-panel-toggle"
      aria-label={label}
      title={label}
      aria-controls={controls}
      aria-expanded={open}
      aria-haspopup={compact ? "dialog" : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
