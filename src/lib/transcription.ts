export async function transcribeAudio(audioBlob: Blob, token: string): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'Error al transcribir el audio.');
  return body.text as string;
}
