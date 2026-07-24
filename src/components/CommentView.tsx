"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverTrigger, PopoverContent, PopoverClose } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { VoiceRecorderControls, type VoiceStage } from "@/components/VoiceRecorderControls";
import { transcribeAudio } from "@/lib/transcription";
import { useClientIdentity } from "@/lib/use-client-identity";
import { normalizePeriodId } from "@/lib/context";
import {
  MessageSquareText,
  CalendarDays,
  Send,
  Loader2,
  Trash2,
  AlertCircle,
  Keyboard,
  Mic,
  RotateCcw,
  User,
  SprayCan,
} from "lucide-react";

interface ApiComment {
  commentEntryKey: number;
  commentText: string;
  createdAtUtc: string;
  authorDisplayName: string | null;
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

/** Display-only: "PYD\Administrador" -> "Administrador". Never used for identity/DB values. */
function stripDomainPrefix(name: string): string {
  const idx = name.indexOf("\\");
  return idx === -1 ? name : name.slice(idx + 1);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}, ${time}`;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** "202508" -> "Agosto 2025", for display only. The stored key stays YYYYMM. */
function formatPeriod(periodId: string): string {
  return `${MESES[Number(periodId.slice(4, 6)) - 1]} ${periodId.slice(0, 4)}`;
}

export function CommentView() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");
  const productId = searchParams.get("productId");
  // The clicked cell's month. A comment explains a deviation in a specific
  // period, so this is part of its identity -- not optional context.
  const periodId = normalizePeriodId(searchParams.get("date"));
  // Once TARGIT's webbox can pass its own logged-in username, it arrives here
  // -- takes priority over manual typing and locks the field (see auth.ts).
  const targitUser = searchParams.get("targitUser")?.trim() || null;
  const { clientToken, usuario, setUsuario } = useClientIdentity();
  const effectiveUsuario = targitUser || usuario;

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

  // Every request to our own API carries the per-browser clientToken (no
  // auth header anymore -- see src/lib/auth.ts). Never written into the
  // visible URL, only into the request itself.
  const buildApiParams = useCallback(() => {
    const params = buildParams();
    if (clientToken) params.set("clientToken", clientToken);
    return params;
  }, [buildParams, clientToken]);

  const load = useCallback(async () => {
    if (!reportId || !productId || !periodId || !clientToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/comments?${buildApiParams().toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al cargar los comentarios.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado al cargar los comentarios.");
    } finally {
      setLoading(false);
    }
  }, [reportId, productId, periodId, clientToken, buildApiParams]);

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
    // navigator.mediaDevices only exists in a secure context (HTTPS or
    // localhost). Served over plain HTTP on the LAN hostname it's undefined,
    // and the old catch-all below blamed microphone permissions for what is
    // really a hosting/protocol limitation. Say the true reason instead.
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError(
        "La grabación de voz requiere una conexión segura (HTTPS). Escribe el comentario a mano mientras tanto."
      );
      return;
    }
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
          const text = await transcribeAudio(blob, clientToken);
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
    const nombre = effectiveUsuario.trim();
    if (!nombre) {
      toast("Escribe tu nombre en el campo Usuario antes de guardar el comentario.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(buildApiParams()), commentText: trimmed, usuario: nombre }),
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
      const res = await fetch("/api/comments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(buildApiParams()), commentEntryKey }),
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

  // FR10: la app se abrió fuera de TARGIT (o con un enlace roto) -- ni siquiera hay reportId.
  if (!reportId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle className="text-lg">Falta contexto</CardTitle>
            </div>
            <CardDescription>
              Esta aplicación debe abrirse desde un enlace de un informe de coste de TARGIT.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // El informe TARGIT está abierto pero la selección todavía no identifica una celda
  // concreta: falta el producto (fila) y/o el mes (columna). TARGIT siempre dispara la
  // llamada, solo que con los filtros que aún no están puestos vacíos. Nada que
  // resolver contra la API hasta que la celda esté completa.
  if (!productId || !periodId) {
    const nombre = targitUser ? stripDomainPrefix(targitUser) : null;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-primary">
              <MessageSquareText className="h-5 w-5 shrink-0" />
              <CardTitle className="text-lg">
                {nombre ? (
                  <>
                    Hola <span className="text-primary">{nombre}</span>
                  </>
                ) : (
                  "Bienvenido"
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Este informe permite guardar comentarios para cada valor que se muestra en las celdas, es decir,
              para un <strong className="text-foreground">producto</strong> y un{" "}
              <strong className="text-foreground">mes</strong> concretos.
            </p>

            <p className="text-muted-foreground">
              Puedes introducir tus comentarios escribiendo o grabando por voz. Tu grabación se transcribirá
              automáticamente y te mostrará el texto para que lo corrijas o modifiques según necesites; después se
              guardará el texto. La grabación de voz no se guarda en el sistema: es únicamente un medio más rápido
              de generar el texto que necesitas.
            </p>

            <p className="text-muted-foreground">Para empezar:</p>

            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full tint-primary text-xs font-semibold text-primary">
                1
              </span>
              <p className="text-foreground">
                Haz clic en la <strong>celda</strong> del informe que quieras comentar: la del producto (fila) en
                el mes (columna) que te interesa.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full tint-primary text-xs font-semibold text-primary">
                2
              </span>
              <p className="text-foreground">
                Aquí verás los comentarios de esa celda y podrás añadir el tuyo.
              </p>
            </div>

            <p className="border-t border-border/50 pt-3 text-muted-foreground">
              ¿La columna <strong className="text-foreground">Comentarios</strong> muestra un contador de notas que ya han sido guardadas para ese producto (fila) y que pueden estar asociadas y repartidas en los diferentes periodos mostrados en el informe.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const product = data?.product;
  const isReviewingTranscript = composerMode === "record" && voiceStage === "review";

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Cabecera */}
      <header className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquareText className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold text-sm sm:text-base truncate">PYD Cost Comments</span>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col max-w-2xl w-full mx-auto px-4">
        {/* Selección actual (FR2). Compacta a propósito: esto vive dentro de un
            panel estrecho al lado del informe, así que el espacio vertical es
            para los comentarios, no para repetir lo que el usuario acaba de
            clicar. Producto y periodo son las dos claves de la celda -- ambos
            se muestran como badges del mismo peso visual, ya que son el dato
            principal que identifica qué se está comentando. */}
        <div className="shrink-0 pt-3">
          <Card className="card-elevated bg-card/90 backdrop-blur-sm">
            <CardContent className="p-3">
              {loading && !data ? (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Selección para comentar
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 rounded-full border tint-primary px-2 py-0.5 text-xs font-mono font-semibold text-primary">
                        <SprayCan className="h-3 w-3 shrink-0" />
                        {productId}
                      </span>
                      <span className="flex items-center gap-1 rounded-full border tint-primary px-2 py-0.5 text-xs font-mono font-semibold text-primary">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        {formatPeriod(periodId)}
                      </span>
                    </div>
                  </div>

                  <p className="font-semibold leading-snug break-words">
                    {product?.productName ?? "Producto no identificado en el maestro"}
                  </p>

                  {(product?.brand || product?.fragrance) && (
                    <p className="text-xs text-muted-foreground break-words">
                      {[product?.brand, product?.fragrance].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <Card className="mt-2 tint-destructive">
              <CardContent className="p-3 flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Historial de comentarios (FR3/FR4/FR8) -- único bloque que hace scroll.
            Vive en el centro, entre la selección (arriba) y el compositor
            (abajo, siempre visible), para que añadir un comentario nunca
            requiera desplazarse. */}
        <Card className="flex-1 min-h-0 my-3 flex flex-col card-elevated bg-card/90 backdrop-blur-sm">
          <CardHeader className="shrink-0 p-3 pb-2">
            <CardTitle className="text-base">
              Comentarios{data?.comments.length ? ` (${data.comments.length})` : ""}
            </CardTitle>
            <CardDescription className="text-xs">
              De esta celda · más recientes primero · visibles para todos
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-y-auto scroll-subtle p-3 pt-0">
            {loading && !data ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-2.5">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-3.5 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : data && data.comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Todavía no hay comentarios para esta selección.</p>
            ) : (
              <div className="space-y-2.5">
                {data?.comments.map((c, i) => (
                  <div key={c.commentEntryKey}>
                    {i > 0 && <Separator className="mb-2.5" />}
                    <div className="flex gap-2.5">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{initials(c.authorDisplayName ?? "?")}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <span className="font-medium text-sm truncate">{c.authorDisplayName}</span>
                            <span className="text-xs text-muted-foreground ml-2">{formatDateTime(c.createdAtUtc)}</span>
                          </div>
                          {c.isOwnComment && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
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
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-64 p-3.5 space-y-3">
                                <div className="space-y-1">
                                  <p className="text-sm font-medium leading-snug">¿Eliminar este comentario?</p>
                                  <p className="text-xs text-muted-foreground leading-snug">
                                    Dejará de verse para todos. No se puede deshacer.
                                  </p>
                                </div>
                                <div className="flex justify-end gap-2">
                                  <PopoverClose asChild>
                                    <Button variant="ghost" size="sm" className="h-8">
                                      Cancelar
                                    </Button>
                                  </PopoverClose>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => handleRemove(c.commentEntryKey)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                        <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.commentText}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tarjeta del compositor (FR5/FR6 + grabación de voz) -- fija abajo,
            siempre visible mientras el historial de arriba hace scroll. */}
        <div className="shrink-0 pb-3">
          <Card className="card-elevated bg-card/90 backdrop-blur-sm">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-base">Añadir un comentario</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2.5">
              {/* Usuario (obligatorio) -- no hay inicio de sesión; ver src/lib/auth.ts.
                  Cuando TARGIT nos da el usuario no es editable, así que se muestra
                  como una línea compacta en vez de un campo de formulario completo:
                  ocupar una fila entera de input para algo que nadie puede tocar es
                  desperdiciar el poco alto que tiene este panel. Si no viene de
                  TARGIT, sí se muestra el campo editable. */}
              {targitUser ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  Comentando como <span className="font-medium text-foreground">{effectiveUsuario}</span>
                  <span className="text-[10px]">(TARGIT)</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="usuario" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Usuario <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="usuario"
                    placeholder="Tu nombre"
                    value={effectiveUsuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
              )}

              {/* Selector de modo: Escribir / Grabar */}
              <div className="inline-flex rounded-md border border-border/50 bg-secondary/30 p-1">
                <button
                  type="button"
                  onClick={() => {
                    if (voiceStage === "recording") discardRecording();
                    setComposerMode("type");
                    setVoiceStage("idle");
                  }}
                  className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm font-medium transition-colors ${
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
                  className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm font-medium transition-colors ${
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
                    className="min-h-[96px] max-h-[180px] overflow-y-auto scroll-subtle"
                  />
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={submitting || loading || !commentText.trim() || !effectiveUsuario.trim()}
                    className="w-full sm:w-auto"
                  >
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
                    className="min-h-[96px] max-h-[180px] overflow-y-auto scroll-subtle"
                  />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={submitting || !commentText.trim() || !effectiveUsuario.trim()}
                      className="w-full sm:w-auto"
                    >
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
                      size="sm"
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
                    <Button size="sm" variant="ghost" onClick={discardRecording} disabled={submitting} className="w-full sm:w-auto">
                      <Trash2 className="h-4 w-4" /> Descartar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

