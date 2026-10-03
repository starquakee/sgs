// Replace only the native character/identity selection with the lobby choice.
// Native doudizhu still owns skills, opening draw, turn order, AI and victory.
export function seatDoudizhuPlayers(game, status, role) {
  const landlord = role === 'farmer' ? game.me.next : game.me;
  const seats = [landlord, landlord.next, landlord.next.next];
  if (game.players.length !== 3 || new Set(seats).size !== 3 || seats.some(player => !game.players.includes(player))) {
    throw new Error('斗地主需要三个独立席位。');
  }
  game.zhu = landlord;
  status.firstAct = landlord;
  seats.forEach((player, index) => {
    player.sgsSeat = index + 1;
    player.identity = index === 0 ? 'zhu' : 'fan';
    player.side = index === 0;
    player.isZhu = index === 0;
    player.showIdentity();
  });
  return seats;
}

export function installDoudizhuMode({ lib, game, _status }, launch, allowed) {
  if (launch.mode !== 'doudizhu') return;
  game.chooseCharacter = function () {
    const next = game.createEvent('chooseCharacter');
    next.setContent(async () => {
      const seats = seatDoudizhuPlayers(game, _status, launch.landlordRole);
      const pool = [...allowed].filter(id => id !== launch.generalId && lib.character[id] && !lib.filter.characterDisabled(id));
      if (pool.length < 2) throw new Error('可用 AI 武将不足，请返回点将台。');
      _status.characterlist = [launch.generalId, ...pool];
      game.me.init(launch.generalId);
      game.addRecentCharacter(launch.generalId);
      for (const player of seats) {
        if (player === game.me) continue;
        const index = Math.floor(Math.random() * pool.length);
        player.init(pool.splice(index, 1)[0]);
      }
      // Match normal doudizhu's native selection bonus, including general exceptions.
      if (!game.zhu.isInitFilter('noZhuHp')) {
        game.zhu.hp++;
        game.zhu.maxHp++;
        game.zhu.update();
      }
      const used = new Set(seats.map(player => player.name1));
      _status.characterlist = _status.characterlist.filter(id => !used.has(id));
      lib.init.onfree();
    });
  };
}
