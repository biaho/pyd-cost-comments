/**
 * TEMPORARY stub. Real speech-to-text (ElevenLabs, matching the pyd-audio-studio
 * pattern) isn't wired into this project yet -- needs an API key + a backend
 * endpoint, tracked as an open item in decisions.log.md. This simulates the
 * async transcribe step so the full voice UX (record -> transcribe -> review
 * -> save) can be built and tested end to end today. Swap `transcribeAudio`
 * for a real call later; nothing else needs to change, since callers only
 * depend on this function's shape (Blob in, text out).
 */
export async function transcribeAudio(_audioBlob: Blob): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return '[Transcripción automática pendiente de configurar — escribe aquí lo que has grabado antes de guardar]';
}
