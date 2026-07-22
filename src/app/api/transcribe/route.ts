import { NextRequest, NextResponse } from 'next/server';
import { resolveUser, logTranscriptionUsage } from '@/lib/data-api-client';
import { computeElevenLabsSttCost } from '@/lib/pricing';

// Same model as pyd-audio-studio's elevenlabs-stt function, same account.
const ELEVENLABS_STT_MODEL = 'scribe_v2';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'La transcripción no está configurada todavía (falta la clave de API).' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio');

    if (!(audioFile instanceof Blob)) {
      return NextResponse.json({ error: 'Falta el archivo de audio.' }, { status: 400 });
    }

    const upstreamForm = new FormData();
    upstreamForm.append('file', audioFile, 'recording.webm');
    upstreamForm.append('model_id', ELEVENLABS_STT_MODEL);

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: upstreamForm,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs STT error:', response.status, errorText);
      return NextResponse.json({ error: 'Error al transcribir el audio.' }, { status: 502 });
    }

    const transcription = await response.json();
    const text: string = transcription.text ?? '';

    // Usage logging is best-effort -- a logging failure must never block returning the transcript.
    try {
      const clientToken = formData.get('clientToken');
      if (typeof clientToken !== 'string' || !clientToken) {
        throw new Error('Falta clientToken en la solicitud de transcripción.');
      }
      const appUserKey = await resolveUser({ clientToken, displayName: '', targitUsername: null });
      const characters = text.length;
      const durationSecondsEst = audioFile.size / 16000; // rough estimate, matches pyd-audio-studio

      await logTranscriptionUsage({
        appUserKey,
        characters,
        durationSecondsEst,
        costUsd: computeElevenLabsSttCost(characters),
        model: ELEVENLABS_STT_MODEL,
      });
    } catch (logErr) {
      console.error('No se pudo registrar el uso de transcripción:', logErr);
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al transcribir el audio.' }, { status: 500 });
  }
}
