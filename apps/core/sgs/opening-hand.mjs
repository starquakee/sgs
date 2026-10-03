// Keep dealing and replacement in the pinned engine. This adapter only repeats
// its native replacement event before the first turn and clarifies the choice UI.
export function installOpeningHand({ lib, game, _status }) {
  const gameDraw = game.gameDraw;
  const nativeDraw = lib.element.content.gameDraw;
  let replacements = 0;
  const describeChoice = (choice, { state }) => {
    const replacement = choice.getParent();
    if (!replacement?.sgsOpeningHand) return;
    if (state === 'begin') {
      choice.sgsOpeningHandChoice = true;
      choice.prompt = '开局换牌';
      choice.prompt2 = `<div class="sgs-opening-copy">当前 ${game.me.countCards('h')} 张起始手牌 · 已换 ${replacements} 次<br>可反复重抽整手牌，满意后开始对局。</div>`;
      choice.choice = false;
      choice.ai = () => false;
    } else if (state === 'end') {
      replacement.sgsAccepted = choice.result?.bool === true;
    }
  };
  const removeHandler = () => game.globalEventHandlers.removeHandler('chooseBool', 'onChooseBool', describeChoice);
  game.globalEventHandlers.pushHandler('chooseBool', 'onChooseBool', describeChoice);
  game.gameDraw = function (...args) {
    // A later skill-created draw event must not reopen the opening prompt.
    game.gameDraw = gameDraw;
    const opening = gameDraw.apply(this, args);
    opening.setContent(async function (event, trigger, player) {
      try {
        await nativeDraw.call(this, event, trigger, player);
        if (_status.connectMode || _status.brawl?.noGameDraw || !event.targets.includes(game.me)) return;
        while (!_status.auto && !_status.over && game.me.isAlive() && game.me.countCards('h')) {
          const next = game.createEvent('replaceHandcards');
          next.players = [game.me];
          next.sgsOpeningHand = true;
          // Preserve native special piles and starting-card tags, including
          // modifications made by the original gameDrawBegin skill triggers.
          next.otherPile = event.otherPile;
          next.gaintag = event.gaintag;
          next.setContent('replaceHandcards');
          await next;
          if (!next.sgsAccepted) break;
          replacements++;
        }
      } finally {
        removeHandler();
      }
    });
    return opening;
  };
}
