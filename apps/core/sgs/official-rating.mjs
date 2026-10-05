export const ratingScopes = [
  ['overall', '综合'], ['landlord', '斗地主·地主'], ['farmer', '斗地主·农民'],
  ['first', '2v2·先手'], ['second', '2v2·后手'], ['lord', '身份·主公'],
  ['loyalist', '身份·忠臣'], ['rebel', '身份·反贼'], ['spy', '身份·内奸'],
];
export const ratingScopeName = scope => ratingScopes.find(([key]) => key === scope)?.[1] || '综合';
export function ratingValue(character, scope = 'overall') {
  const data = character?.officialRating;
  const value = data?.status === 'matched' ? data.scores?.[scope] : null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10 ? value : null;
}
export function compareOfficialRatings(a, b, scope, order) {
  if (!['high', 'low'].includes(order)) return 0;
  const left = ratingValue(a, scope), right = ratingValue(b, scope);
  // Missing scores stay at the end in BOTH directions. Stable sort preserves
  // the existing pack/recent order for equal scores and unmatched versions.
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
  return order === 'high' ? right - left : left - right;
}
export function normalizeRatingPreference(value) {
  return { order: ['high', 'low'].includes(value?.order) ? value.order : 'default',
    scope: ratingScopes.some(([key]) => key === value?.scope) ? value.scope : 'overall' };
}
