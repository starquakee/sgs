const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function descriptionHTML(text) {
  const lines = String(text ?? '').split('\n').filter(line => line.trim());
  const parts = []; let list = [];
  const flush = () => { if (list.length) { parts.push(`<ul>${list.join('')}</ul>`); list = []; } };
  for (const line of lines) {
    if (line.startsWith('• ')) list.push(`<li>${escape(line.slice(2))}</li>`);
    else { flush(); parts.push(`<p>${escape(line)}</p>`); }
  }
  flush(); return parts.join('');
}
function sourceHTML(source, commit) {
  if (!source || !/^[a-f0-9]{40}$/.test(commit || '') || !/^apps\/core\/[\w/.-]+\.(?:js|ts)$/.test(source.file || '') || !Number.isInteger(source.line)) return '';
  const url = `https://github.com/libnoname/noname/blob/${commit}/${source.file}#L${source.line}`;
  return `<details class="skill-source"><summary>说明来源</summary><a href="${escape(url)}" target="_blank" rel="noreferrer">查看锁定版本原文 · 第 ${source.line} 行 ↗</a></details>`;
}
export function skillReadingHTML(skills, catalog = {}) {
  if (!skills.length) return '<section class="skill"><p>此武将无初始技能。</p></section>';
  return skills.map(skill => {
    const help = skill.help;
    const text = help?.text || skill.description || '此项说明暂未完整收录，请在对局中查看原生说明。';
    const terms = (help?.terms || []).map(term => {
      let body;
      if (term.status === 'character') {
        const matches = (catalog.characters || []).filter(c => c.id === term.characterId && !c.isUnseen);
        body = matches.length === 1 ? `<p class="skill-reading-note">关联武将 · ${escape(matches[0].name)}</p>`
          + matches[0].skills.map(s => `<h4>${escape(s.name)}</h4>${descriptionHTML(s.help?.text || s.description || '说明待收录')}`).join('')
          : '<p>关联武将说明待核实，可在对局中查看。</p>';
      } else body = descriptionHTML(term.text || (term.reason === 'cycle' ? '此处回引已列出的技能，请参照上文对应说明。' : '此条解释暂未完整收录，请在对局中查看。'));
      return `<details class="skill-term"><summary>${escape(term.name)}</summary><div class="skill-term-body">${body}${sourceHTML(term.source, catalog.upstream?.commit)}</div></details>`;
    }).join('');
    return `<section class="skill"><h3>${escape(skill.name)}</h3><div class="skill-reading-body">${descriptionHTML(text)}</div>`
      + (help?.dynamic ? '<p class="skill-reading-note">这里展示初始规则；技能在局内变化后，以原生实时说明为准。</p>' : '')
      + (terms ? `<details class="skill-terms"><summary>相关技能与术语 · ${help.terms.length}</summary>${terms}</details>` : '')
      + sourceHTML(help?.source, catalog.upstream?.commit) + '</section>';
  }).join('');
}

export function closeReadingDetails(event) {
  if (event.key !== 'Escape' || event.isComposing) return;
  const details = event.target.closest?.('details[open]');
  if (details) { event.preventDefault(); event.stopPropagation(); details.open = false; details.querySelector('summary')?.focus(); }
}
