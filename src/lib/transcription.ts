export async function transcribeAudio(audioBlob: Blob, clientToken: string | null): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  if (clientToken) formData.append('clientToken', clientToken);

  const res = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'Error al transcribir el audio.');
  return body.text as string;
}
