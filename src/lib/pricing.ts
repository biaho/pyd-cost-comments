// Mirrors pyd-audio-studio's supabase/functions/_shared/pricing.ts ElevenLabs STT formula.
export const ELEVENLABS_COST_PER_CHAR = 0.00022;

export function computeElevenLabsSttCost(characters: number): number {
  return characters * ELEVENLABS_COST_PER_CHAR;
}
