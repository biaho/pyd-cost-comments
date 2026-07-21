"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { VoiceRecorderControls, type VoiceStage } from "@/components/VoiceRecorderControls";
import { transcribeAudio } from "@/lib/transcription";
import { useAuthToken } from "@/lib/use-auth-token";
import {
  MessageSquareText,
  FileText,
  Gem,
  Flower2,
  SprayCan,
  Send,
  Loader2,
  Trash2,
  AlertCircle,
  Keyboard,
  Mic,
  RotateCcw,
} from "lucide-react";

interface ApiComment {
  commentEntryKey: number;
  commentText: string;
  createdAtUtc: string;
  authorDisplayName: string | null;
  authorUserPrincipalName: string | null;
  isOwnComment: boolean;
}

interface ApiContext {
  reportId: string;
  productId: string;
}

/** Resolved server-side from DWH's product master — the URL carries IDs only. */
interface ApiProduct {
  productId: string;
  productName: string | null;
  brand: string | null;
  fragrance: string | null;
}

interface ApiResponse {
  context: ApiContext;
  product: ApiProduct | null;
  viewingAs: string;
  comments: ApiComment[];
}

type ComposerMode = "type" | "record";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}, ${time}`;
}

export function CommentView() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");
  const productId = searchParams.get("productId");
  const getToken = useAuthToken();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingKey, setRemovingKey] = useState<number | null>(null);

  // Composer: typed vs. voice-recorded input (both converge on the same commentText + save action).
  const [composerMode, setComposerMode] = useState<ComposerMode>("type");
  const [voiceStage, setVoiceStage] = useState<VoiceStage>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildParams = useCallback(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const load = useCallback(async () => {
    if (!reportId || !productId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/comments?${buildParams().toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al cargar los comentarios.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado al cargar los comentarios.");
    } finally {
      setLoading(false);
    }
  }, [reportId, productId, buildParams, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Release the microphone if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const resetComposer = () => {
    setComposerMode("type");
    setVoiceStage("idle");
    setVoiceError(null);
    setElapsedSeconds(0);
    setCommentText("");
  };

  const startRecording = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setVoiceStage("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        try {
          const token = await getToken();
          const text = await transcribeAudio(blob, token);
          setCommentText(text);
          setVoiceStage("review");
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : "Error al transcribir el audio.");
          setVoiceStage("idle");
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setVoiceStage("recording");
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } catch {
      setVoiceError("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  };

  const discardRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setVoiceStage("idle");
    setElapsedSeconds(0);
    setCommentText("");
  };

  const handleSave = async () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...Object.fromEntries(buildParams()), commentText: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al guardar.");
      setData((prev) => (prev ? { ...prev, comments: body.comments } : prev));
      resetComposer();
      toast("Comentario guardado.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (commentEntryKey: number) => {
    setRemovingKey(commentEntryKey);
    try {
      const token = await getToken();
      const res = await fetch("/api/comments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...Object.fromEntries(buildParams()), commentEntryKey }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al eliminar.");
      setData((prev) => (prev ? { ...prev, comments: body.comments } : prev));
      toast("Comentario eliminado.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar.");
    } finally {
      setRemovingKey(null);
    }
  };

  // FR10: parámetros obligatorios ausentes en la URL
  if (!reportId || !productId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle className="text-lg">Falta contexto</CardTitle>
            </div>
            <CardDescription>
              Esta aplicación debe abrirse desde un enlace de un informe de coste de TARGIT. No se han
              encontrado en la URL los parámetros obligatorios (
              <code className="font-mono text-xs">reportId</code>, <code className="font-mono text-xs">productId</code>).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const product = data?.product;
  const isReviewingTranscript = composerMode === "record" && voiceStage === "review";

  return (
    <div className="min-h-screen bg-background">
      {/* Cabecera */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquareText className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold text-sm sm:text-base truncate">PYD Cost Comments</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 sm:py-6 space-y-4">
        {/* Tarjeta de contexto (FR2) */}
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Contexto del informe</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <ContextField icon={FileText} label="Informe" value={reportId} />
                {product?.brand && <ContextField icon={Gem} label="Marca" value={product.brand} />}
                {product?.fragrance && <ContextField icon={Flower2} label="Fragancia" value={product.fragrance} />}
                <ContextField
                  icon={SprayCan}
                  label="Producto"
                  value={product?.productName ?? productId}
                  secondary={product?.productName ? productId : undefined}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </CardContent>
          </Card>
        )}

        {/* Tarjeta del compositor (FR5/FR6 + grabación de voz) */}
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Añadir un comentario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Selector de modo: Escribir / Grabar */}
            <div className="inline-flex rounded-md border border-border/50 bg-secondary/30 p-1">
              <button
                type="button"
                onClick={() => {
                  if (voiceStage === "recording") discardRecording();
                  setComposerMode("type");
                  setVoiceStage("idle");
                }}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  composerMode === "type" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={composerMode === "type"}
              >
                <Keyboard className="h-3.5 w-3.5" /> Escribir
              </button>
              <button
                type="button"
                onClick={() => {
                  setComposerMode("record");
                  setCommentText("");
                }}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  composerMode === "record" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={composerMode === "record"}
              >
                <Mic className="h-3.5 w-3.5" /> Grabar
              </button>
            </div>

            {composerMode === "type" && (
              <>
                <Textarea
                  placeholder="Explica la desviación de coste que has detectado..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  disabled={submitting || loading}
                />
                <Button onClick={handleSave} disabled={submitting || loading || !commentText.trim()} className="w-full sm:w-auto">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Guardar comentario
                    </>
                  )}
                </Button>
              </>
            )}

            {composerMode === "record" && !isReviewingTranscript && (
              <VoiceRecorderControls
                stage={voiceStage}
                elapsedSeconds={elapsedSeconds}
                error={voiceError}
                onStart={startRecording}
                onStop={stopRecording}
                onDiscard={discardRecording}
              />
            )}

            {isReviewingTranscript && (
              <>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Revisa el texto antes de guardar — esto es lo que se guardará
                </p>
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  disabled={submitting}
                  aria-label="Transcripción — edítala antes de guardar"
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={handleSave} disabled={submitting || !commentText.trim()} className="w-full sm:w-auto">
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" /> Guardar comentario
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setVoiceStage("idle");
                      setCommentText("");
                    }}
                    disabled={submitting}
                    className="w-full sm:w-auto"
                  >
                    <RotateCcw className="h-4 w-4" /> Volver a grabar
                  </Button>
                  <Button variant="ghost" onClick={discardRecording} disabled={submitting} className="w-full sm:w-auto">
                    <Trash2 className="h-4 w-4" /> Descartar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Historial de comentarios (FR3/FR4/FR8) */}
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Historial de comentarios</CardTitle>
            <CardDescription>Más recientes primero · visible para todos los usuarios autorizados</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : data && data.comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Todavía no hay comentarios para esta selección.</p>
            ) : (
              <div className="space-y-4">
                {data?.comments.map((c, i) => (
                  <div key={c.commentEntryKey}>
                    {i > 0 && <Separator className="mb-4" />}
                    <div className="flex gap-3">
                      <Avatar>
                        <AvatarFallback>{initials(c.authorDisplayName ?? "?")}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <span className="font-medium text-sm truncate">{c.authorDisplayName}</span>
                            <span className="text-xs text-muted-foreground ml-2">{formatDateTime(c.createdAtUtc)}</span>
                          </div>
                          {c.isOwnComment && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemove(c.commentEntryKey)}
                              disabled={removingKey === c.commentEntryKey}
                              aria-label="Eliminar comentario"
                              className="h-7 px-2 text-muted-foreground hover:text-destructive"
                            >
                              {removingKey === c.commentEntryKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">{c.commentText}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ContextField({
  icon: Icon,
  label,
  value,
  secondary,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm truncate">{value}</div>
        {secondary && <div className="text-xs text-muted-foreground truncate">ID: {secondary}</div>}
      </div>
    </div>
  );
}
