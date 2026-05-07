"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  rawKey: string | null;
  onClose: () => void;
};

export function SubKeyRevealModal({ rawKey, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const open = rawKey !== null;

  async function copy() {
    if (!rawKey) return;
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy. Select the text manually.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save your sub-key now</DialogTitle>
          <DialogDescription>
            This is the only time the raw key will be shown. Store it in your secrets manager before
            closing this dialog.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="bg-muted rounded-md border px-3 py-2 font-mono text-sm break-all">
            {rawKey ?? ""}
          </div>
          <Button type="button" variant="secondary" onClick={copy}>
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            I&apos;ve saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
