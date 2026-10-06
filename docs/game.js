"use strict";

// GitHub Pages版: ルールと進行はブラウザー内で処理する。
const PagesGame = (() => {
  const storageKey = "title-game-pages-v1";
  let game = {phase: "setup", revision: 0};
  let genres;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved && Number.isInteger(saved.revision) &&
        ["setup", "handover", "submit", "vote", "result", "finished"].includes(saved.phase)) game = saved;
  } catch (_) { /* 保存不可のブラウザーでも、そのまま遊べる。 */ }

  async function readJSON(filename) {
    const response = await fetch(new URL(filename, document.baseURI), {cache: "no-store"});
    if (!response.ok) throw new Error("山札ファイルを読み込めませんでした。");
    return response.json();
  }

  function shuffle(source) {
    const result = [...source];
    const random = new Uint32Array(1);
    for (let i = result.length - 1; i > 0; i--) {
      const size = i + 1;
      const limit = 4294967296 - 4294967296 % size;
      do { crypto.getRandomValues(random); } while (random[0] >= limit);
      const j = random[0] % size;
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function beginRound() {
    game.round++;
    const deck = shuffle(game.words);
    game.hands = game.players.map((_, i) => deck.slice(i * 7, (i + 1) * 7));
    game.submissions = [];
    game.votes = [];
    game.playerIdx = 0;
    game.activity = "submit";
    game.phase = "handover";
  }

  function state() {
    const value = {phase: game.phase, revision: game.revision, genres, dark: Boolean(game.genre?.dark)};
    if (!game.genre) return value;
    Object.assign(value, {genre: game.genre.name, description: game.genre.description,
      work_label: game.genre.work_label, criterion: game.genre.vote_criterion,
      round: game.round, rounds: game.rounds, activity: game.activity, player_count: game.players.length});
    if (["handover", "submit", "vote"].includes(game.phase)) {
      value.player = game.players[game.playerIdx];
      value.player_number = game.playerIdx + 1;
    }
    if (game.phase === "submit") value.hand = game.hands[game.playerIdx];
    if (game.phase === "vote") value.titles = game.titles.map((item, id) => ({id, title: item.title, is_self: item.playerIdx === game.playerIdx}));
    if (game.phase === "result") value.results = game.results;
    if (game.phase === "finished") {
      const sorted = game.players.map((player, i) => ({player, score: game.scores[i]})).sort((a, b) => b.score - a.score);
      let rank = 1;
      value.rankings = sorted.map((item, i) => {
        if (i > 0 && item.score !== sorted[i - 1].score) rank = i + 1;
        return {...item, rank};
      });
    }
    return value;
  }

  async function dispatch(data) {
    if (data.revision !== game.revision) throw new Error("画面が更新されています。最新の画面で操作してください。");
    const action = data.action;
    if (action === "reset") {
      game = {phase: "setup", revision: game.revision};
    } else if (game.phase === "setup" && action === "start") {
      if (!Array.isArray(data.players) || data.players.some(n => typeof n !== "string")) throw new Error("プレイヤー名を入力してください。");
      const players = data.players.map(n => n.trim()).filter(Boolean);
      if (players.length < 3 || players.length > 6) throw new Error("プレイヤー人数は3〜6人です。");
      if (new Set(players).size !== players.length) throw new Error("プレイヤー名に重複があります。");
      if (!Number.isInteger(data.rounds) || data.rounds < 1 || data.rounds > 10) throw new Error("ラウンド数は1〜10で指定してください。");
      const genre = genres.find(g => g.name === data.genre);
      if (!genre) throw new Error("ジャンルを選択してください。");
      if (genre.dark && data.dark_consent !== true) throw new Error("ダークモードの注意事項を読み、同意のチェックを入れてください。");
      const deck = await readJSON(genre.filename);
      if (!Array.isArray(deck.words) || deck.words.some(w => typeof w !== "string" || !w.trim())) throw new Error("山札に空文字、または不正なカードがあります。");
      const normalized = deck.words.map(w => w.normalize("NFKC").trim());
      if (new Set(normalized).size !== normalized.length) throw new Error("山札に重複する単語があります。");
      if (deck.words.length < players.length * 7) throw new Error("山札の枚数が足りません。");
      game = {phase: "setup", revision: game.revision, genre: {...genre}, players, rounds: data.rounds,
        round: 0, words: [...deck.words], scores: players.map(() => 0)};
      beginRound();
    } else if (game.phase === "handover" && action === "reveal") {
      game.phase = game.activity;
    } else if (game.phase === "submit" && action === "submit") {
      if (!Array.isArray(data.cards) || data.cards.length > 8) throw new Error("カードを選択してください。");
      const words = [], used = new Set();
      let freeCount = 0;
      for (const card of data.cards) {
        if (!card || typeof card !== "object") throw new Error("カード形式が正しくありません。");
        if (Object.hasOwn(card, "hand_idx")) {
          const idx = card.hand_idx;
          if (!Number.isInteger(idx) || idx < 0 || idx >= 7 || used.has(idx)) throw new Error("手札は各カード1回だけ使用できます。");
          used.add(idx);
          words.push(game.hands[game.playerIdx][idx]);
        } else if (typeof card.free_word === "string") {
          const word = card.free_word.trim();
          if ([...word].length < 1 || [...word].length > 4) throw new Error("フリーワードは1〜4文字で入力してください。");
          freeCount++;
          words.push(word);
        } else throw new Error("カード形式が正しくありません。");
      }
      if (freeCount !== 1) throw new Error("フリーワードを必ず1つ追加してください。");
      game.submissions[game.playerIdx] = words.join(" ");
      game.playerIdx++;
      if (game.playerIdx === game.players.length) {
        game.titles = shuffle(game.submissions.map((title, playerIdx) => ({title, playerIdx})));
        game.playerIdx = 0;
        game.activity = "vote";
      }
      game.phase = "handover";
    } else if (game.phase === "vote" && action === "vote") {
      const id = data.title_id;
      if (!Number.isInteger(id) || !game.titles[id]) throw new Error("投票する作品を選択してください。");
      if (game.titles[id].playerIdx === game.playerIdx) throw new Error("自分の作品には投票できません。");
      game.votes[game.playerIdx] = id;
      game.playerIdx++;
      if (game.playerIdx === game.players.length) {
        const voters = game.players.map(() => []);
        game.votes.forEach((titleId, voterIdx) => voters[game.titles[titleId].playerIdx].push(game.players[voterIdx]));
        game.results = game.players.map((player, i) => {
          game.scores[i] += voters[i].length;
          return {player, title: game.submissions[i], votes: voters[i].length,
            voters: voters[i], accumulated_score: game.scores[i]};
        }).sort((a, b) => b.votes - a.votes);
        game.phase = "result";
      } else game.phase = "handover";
    } else if (game.phase === "result" && action === "next") {
      if (game.round === game.rounds) game.phase = "finished";
      else beginRound();
    } else throw new Error("この画面では実行できない操作です。");
    game.revision++;
    try { sessionStorage.setItem(storageKey, JSON.stringify(game)); } catch (_) { /* 保存不可でもプレイは継続。 */ }
  }

  async function request(path, options = {}) {
    if (!genres) genres = await readJSON("genres.json");
    try {
      if (path === "/api/action") await dispatch(JSON.parse(options.body));
      return {ok: true, json: async () => state()};
    } catch (error) {
      return {ok: false, json: async () => ({error: error.message, state: state()})};
    }
  }
  return {request};
})();
