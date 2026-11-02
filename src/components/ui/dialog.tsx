"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function Dialog({ open, title, onClose, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        "w-[min(32rem,calc(100%-2rem))] rounded-lg border border-charcoal/10 bg-cream p-6 text-charcoal shadow-sm backdrop:bg-charcoal/40",
        className,
      )}
      onClose={onClose}
    >
      <h2 id={titleId} className="font-display text-2xl">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
      <div className="mt-6 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </dialog>
  );
}

export const Modal = Dialog;
