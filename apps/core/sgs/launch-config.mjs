export const launchKey = 'sgs.single-player.launch.v1';
export function attachInitialIdentity(game, identity) {
  if (!['zhu', 'zhong', 'fan', 'nei'].includes(identity)) return;
  const createEvent = game.createEvent;
  game.createEvent = function (name, ...args) {
    const event = createEvent.call(this, name, ...args);
    if (name === 'chooseCharacter') {
      event.identity = identity;
      game.createEvent = createEvent;
    }
    return event;
  };
}
export function normalizeLaunch(input = {}) {
  const mode = ['identity', 'versus', 'doudizhu'].includes(input.mode) ? input.mode : Number(input.playerCount) === 4 ? 'versus' : 'identity';
  const playerCount = mode === 'versus' ? 4 : mode === 'doudizhu' ? 3 : [5, 6, 7, 8].includes(Number(input.playerCount)) ? Number(input.playerCount) : 8;
  return {
    generalId: typeof input.generalId === 'string' && /^[\w\u00c0-\u024f\u4e00-\u9fff]+$/u.test(input.generalId) ? input.generalId : 'caocao',
    pack: typeof input.pack === 'string' && /^[a-zA-Z0-9_]+$/.test(input.pack) ? input.pack : 'standard',
    identity: ['zhu', 'zhong', 'fan', 'nei'].includes(input.identity) ? input.identity : 'random',
    mode,
    landlordRole: input.landlordRole === 'farmer' ? 'farmer' : 'landlord',
    playerCount,
    speed: ['normal', 'fast'].includes(input.speed) ? input.speed : 'normal',
  };
}

export function engineSettings(input) {
  const launch = normalizeLaunch(input);
  return {
    mode: launch.mode, show_splash: 'off', new_tutorial: true, version: '1.11.7',
    auto_confirm: false, enable_drag: false, fold_card: true,
    hiddenModePack: ['identity', 'versus', 'doudizhu', 'guozhan', 'boss', 'single', 'chess', 'stone', 'connect', 'brawl', 'tafang'].filter(mode => mode !== launch.mode),
    characters: [...new Set(['standard', 'shenhua', 'refresh', 'yijiang', 'newjiang', 'sp', 'sp2', 'xianding', 'huicui', 'extra', launch.pack])],
    cards: ['standard', 'extra'], plays: [], extensions: [],
    identity_bannedcards: ['muniu'], versus_bannedcards: ['muniu'], doudizhu_bannedcards: ['muniu'],
    continue_name: [launch.generalId],
    doudizhu_mode_mode_config_doudizhu: 'normal',
    feiyang_version_mode_config_doudizhu: 'decade',
    enhance_dizhu_mode_config_doudizhu: 'disabled', enhance_nongmin_mode_config_doudizhu: 'decade',
    double_character_mode_config_doudizhu: false,
    change_identity_mode_config_doudizhu: false, change_choice_mode_config_doudizhu: false,
    free_choose_mode_config_doudizhu: false,
    // The SGS opening flow uses native replaceHandcards for every supported mode.
    // Disable the separate native prompt to avoid asking twice in identity/DDZ.
    change_card_mode_config_doudizhu: 'disabled',
    change_card_mode_config_versus: 'disabled',
    versus_mode_mode_config_versus: 'two',
    two_assign_mode_config_versus: false, two_phaseswap_mode_config_versus: false,
    replace_character_two_mode_config_versus: false,
    replace_handcard_two_mode_config_versus: true, olfeiyang_four_mode_config_versus: true,
    change_identity_mode_config_versus: false, change_choice_mode_config_versus: false,
    free_choose_mode_config_versus: false,
    player_number_mode_config_identity: String(launch.playerCount),
    identity_mode_mode_config_identity: 'normal',
    double_character_mode_config_identity: false, double_nei_mode_config_identity: false,
    enable_commoner_mode_config_identity: false, special_identity_mode_config_identity: false,
    change_identity_mode_config_identity: false, change_choice_mode_config_identity: false,
    free_choose_mode_config_identity: false, change_card_mode_config_identity: 'disabled',
    choice_zhu_mode_config_identity: 3, choice_zhong_mode_config_identity: 4,
    choice_fan_mode_config_identity: 3, choice_nei_mode_config_identity: 6,
    choose_group_mode_config_identity: false, change_skin: false,
    background_music: 'music_off', background_audio: true, equip_audio: false, background_speak: false,
    volumn_background: 0, volumn_audio: 6,
    game_speed: launch.speed === 'fast' ? 'vfast' : 'fast',
    theme: 'simple', layout: 'nova', image_background: 'default', image_background_random: false,
    card_style: 'ol', cardback_style: 'official', hp_style: 'official',
    cardshape: 'oblong', player_border: 'slim',
    show_connect: false, show_auto: true, show_pause: true, show_wuxie: true,
    show_cardpile: true, show_cardpile_number: true, dev: false,
  };
}
