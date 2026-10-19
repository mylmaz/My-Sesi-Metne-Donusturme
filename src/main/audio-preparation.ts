export interface StereoRms {
  leftDb: number;
  rightDb: number;
  mixedDb: number;
}

export function readStereoRms(stderr: string): StereoRms | undefined {
  const levels = new Map<number, number>();
  let channel = 0;
  for (const line of stderr.split(/\r?\n/)) {
    const heading = /\bChannel:\s*([123])\s*$/.exec(line);
    if (heading) channel = Number(heading[1]);
    if (/\bOverall\s*$/.test(line)) channel = 0;
    const level = /\bRMS level dB:\s*(-inf|[-+]?\d+(?:\.\d+)?)\s*$/.exec(line);
    if (channel && level) levels.set(channel, Number(level[1] === "-inf" ? "-Infinity" : level[1]));
  }
  if (![1, 2, 3].every(index => levels.has(index))) return undefined;
  return { leftDb: levels.get(1)!, rightDb: levels.get(2)!, mixedDb: levels.get(3)! };
}

export function stereoCancellationChannel(levels: StereoRms | undefined) {
  if (!levels || !Number.isFinite(levels.leftDb) || !Number.isFinite(levels.rightDb)) return undefined;
  const left = 10 ** (levels.leftDb / 10);
  const right = 10 ** (levels.rightDb / 10);
  const mixed = levels.mixedDb === -Infinity ? 0 : 10 ** (levels.mixedDb / 10);
  if (!Number.isFinite(mixed) || Math.max(levels.leftDb, levels.rightDb) < -60) return undefined;
  // The third measured channel is exactly (L+R)/2. Its mean-square energy
  // therefore gives E[LR] = 2*E[mix²] - (E[L²]+E[R²])/2, without guessing from
  // file extensions, duration, silence gaps, or speech decoder confidence.
  const correlation = Math.max(-1, Math.min(1, (2 * mixed - (left + right) / 2) / Math.sqrt(left * right)));
  const cancellationDb = mixed === 0 ? -Infinity : 10 * Math.log10(mixed / Math.max(left, right));
  // Restrict the exception to near-identical opposite-polarity channels whose
  // sum loses >99.9% of channel energy. Ordinary/alternating stereo stays mixed.
  if (correlation > -0.999 || cancellationDb > -30) return undefined;
  return { channel: right > left ? 1 as const : 0 as const, correlation, cancellationDb, ...levels };
}
