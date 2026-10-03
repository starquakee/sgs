// SGS adapter, GPL-3.0. Keep the native final nature/amount/armor choice.
export function resolveDamageAudio(path, manifest, event) {
  // Native damage step 4 requests impact audio after damage modification and
  // prevention. Ignore its zero/unreal cases, replay previews and arbitrary
  // playAudio calls that do not belong to a real positive damage event.
  if (event?.name !== 'damage' || !(event.num > 0) || event.unreal || event._cancelled) return null;
  const key = String(path).replace(/^audio\//, '').replace(/\.mp3$/i, '');
  if (!/^effect\/(?:damage(?:_(?:fire|thunder|ice))?|hujia_damage(?:_(?:fire|thunder))?)2?$/.test(key)) return null;
  return manifest?.clips?.[key] || null;
}
