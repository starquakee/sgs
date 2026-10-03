// The lobby replaces only native 2v2 character selection. Versus start, turn
// order, AI attitudes, damage, death and team victory stay in the upstream mode.
export function seatTwoPlayerTeams(game, status) {
  const seats = [game.me.next, game.me.next.next, game.me.previous, game.me];
  if (game.players.length !== 4 || new Set(seats).size !== 4) throw new Error('双人对抗需要四个独立席位。');
  seats.forEach((player, index) => {
    player.sgsSeat = index + 1;
    player.side = index === 0 || index === 3;
    player.node.identity.firstChild.innerHTML = player === game.me ? '我' : player.side ? '友' : '敌';
    player.node.identity.dataset.color = `${player.side}zhu`;
  });
  status.firstAct = seats[0];
  return seats;
}

export function installTwoPlayerTeamMode({ lib, game, get, _status }, launch, allowed) {
  if (launch.playerCount !== 4) return;
  game.chooseCharacterTwo = function () {
    const next = game.createEvent('chooseCharacter');
    next.setContent(async () => {
      const seats = seatTwoPlayerTeams(game, _status);
      const pool = [...allowed].filter(id => id !== launch.generalId && lib.character[id] && !lib.filter.characterDisabled(id));
      if (pool.length < 3) throw new Error('可用 AI 武将不足，请返回点将台。');
      _status.characterlist = [launch.generalId, ...pool];
      game.me.init(launch.generalId);
      game.addRecentCharacter(launch.generalId);
      for (const player of seats) {
        if (player === game.me) continue;
        const index = Math.floor(Math.random() * pool.length);
        player.init(pool.splice(index, 1)[0]);
      }
      const used = new Set(seats.map(player => player.name1));
      _status.characterlist = _status.characterlist.filter(id => !used.has(id));
      // Keep the native 2v2 fourth-seat protection and teammate-hand inspection.
      if (get.config('olfeiyang_four') && game.me.isIn()) game.me.addSkill('olfeiyang');
      game.addGlobalSkill('versus_viewHandcard');
      lib.init.onfree();
    });
  };
}
