"use client";

import { Mic, Square, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export type VoiceStage = "idle" | "recording" | "processing" | "review";

interface VoiceRecorderControlsProps {
  stage: VoiceStage;
  elapsedSeconds: number;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onDiscard: () => void;
}

export function VoiceRecorderControls({ stage, elapsedSeconds, error, onStart, onStop, onDiscard }: VoiceRecorderControlsProps) {
  if (stage === "idle") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Button
          onClick={onStart}
          size="lg"
          className="h-16 w-16 rounded-full p-0"
          aria-label="Iniciar grabación"
        >
          <Mic className="h-6 w-6" />
        </Button>
        <p className="text-sm text-muted-foreground max-w-xs">
          Graba una nota y revisa la transcripción antes de guardar.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (stage === "recording") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex items-center gap-2 text-destructive" role="status" aria-live="polite">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden="true" />
          <span className="text-sm font-medium">Grabando · {formatElapsed(elapsedSeconds)}</span>
        </div>
        <div className="flex gap-2">
          <Button onClick={onStop} aria-label="Detener grabación">
            <Square className="h-4 w-4" /> Detener
          </Button>
          <Button onClick={onDiscard} variant="ghost" aria-label="Descartar grabación">
            <Trash2 className="h-4 w-4" /> Descartar
          </Button>
        </div>
      </div>
    );
  }

  // processing
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" />
      <p className="text-sm text-muted-foreground">Transcribiendo tu nota…</p>
    </div>
  );
}
