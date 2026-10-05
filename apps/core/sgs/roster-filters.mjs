export const browsePacks = [
  ['yijiang', '一将成名'], ['limited', '限定专属'], ['huicui', '群英荟萃'],
  ['xinghe', '星河璀璨'], ['mou', '谋包'], ['wei', '威包'],
  ['classic', '经典与界限'], ['other', '其他版本'],
];
export const browsePackName = id => browsePacks.find(([key]) => key === id)?.[1] || '其他版本';
export const isOldGeneral = character => character.release?.era === 'old';
export const hasUnknownYear = character => !['old', 'recent'].includes(character.release?.era);
export function releaseLabel(character) {
  const release = character.release;
  if (hasUnknownYear(character)) return '年份待核实';
  if (release.year) return `${release.year}年${release.basis === 'source-edition' ? '版' : '推出'}`;
  return release.era === 'old' ? '2020年及以前已有' : '2021年起的新系列';
}
export function inBrowseScope(character, version) {
  const category = character.version.category;
  // Source version classification is unchanged. The browsing collection also
  // includes new Yijiang and refresh versions, which have mixed source labels.
  return !character.isUnseen && (version === 'all' || (version === 'target'
    ? ['decade', 'common'].includes(category) || (character.browsePack && character.browsePack !== 'other')
    : category === version));
}
export function compareBrowseCharacters(a, b) {
  const index = character => {
    const i = browsePacks.findIndex(([id]) => id === character.browsePack);
    return i < 0 ? browsePacks.length : i;
  };
  return index(a) - index(b) || (b.release?.year || 0) - (a.release?.year || 0);
}
