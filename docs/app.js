"use strict";

const app = document.querySelector("#app");
const errorBox = document.querySelector("#error");
const statusBar = document.querySelector("#status");
const resetButton = document.querySelector("#reset");
let state;
let cards = [];
let freeText = "";
let pending = false;
let dragIndex = null;
let presentationKey = "";
let revealed = [];
let ballot = [];
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const E = escapeHTML;

function showError(message = "") {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

async function load() {
  try {
    const response = await PagesGame.request("/api/state", {cache: "no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    state = data;
    render();
  } catch (error) {
    showError(`公開用ファイルを読み込めません。ページを更新してください。${error.message || ""}`);
    app.innerHTML = '<button class="primary" data-action="reload">もう一度接続する</button>';
  }
}

async function act(action, payload = {}) {
  if (pending) return;
  pending = true;
  showError();
  const buttons = [...document.querySelectorAll("button")].map(button => [button, button.disabled]);
  buttons.forEach(([button]) => { button.disabled = true; });
  app.setAttribute("aria-busy", "true");
  try {
    const response = await PagesGame.request("/api/action", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action, revision: state.revision, ...payload})
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.state && data.state.revision !== state.revision) {
        state = data.state;
        cards = [];
        freeText = "";
        render();
      }
      throw new Error(data.error || "操作できませんでした。");
    }
    state = data;
    cards = [];
    freeText = "";
    if (action === "reset" || action === "start") presentationKey = "";
    render();
    window.scrollTo({top: 0});
  } catch (error) {
    showError(error.message || "読み込みに失敗しました。ページを更新してください。");
  } finally {
    pending = false;
    buttons.forEach(([button, disabled]) => { if (button.isConnected) button.disabled = disabled; });
    app.removeAttribute("aria-busy");
  }
}

function render() {
  document.documentElement.classList.toggle("dark-mode", Boolean(state.dark));
  statusBar.hidden = state.phase === "setup";
  resetButton.hidden = state.phase === "setup";
  if (state.genre) {
    statusBar.innerHTML = `<span class="genre-badge">ジャンル：${E(state.genre)}</span><span>第 ${state.round} / ${state.rounds} ラウンド</span>`;
  }
  if (state.phase === "setup") renderSetup();
  if (state.phase === "handover") renderHandover();
  if (state.phase === "submit") renderSubmit();
  if (state.phase === "vote") renderVote();
  if (state.phase === "result") renderResults();
  if (state.phase === "finished") renderFinal();
}

function renderSetup() {
  app.innerHTML = `<h1>ゲーム設定</h1>
    <form id="setup-form" class="setup-grid">
      <section class="panel"><div class="section-heading"><h2>ジャンル</h2></div>
        <div class="genre-options">${state.genres.map((genre, i) => `<label class="genre-option"><input type="radio" name="genre" value="${E(genre.name)}" ${i === 0 ? "checked" : ""}><span><strong>${E(genre.name)}</strong><small>${E(genre.description)}</small></span></label>`).join("")}</div>
        <p class="note">選んだジャンルは、全ラウンドで固定。</p>
        <div id="dark-warning" class="dark-warning" hidden>
          <strong>ダークモードをプレイする前に</strong>
          <p>このプレイ体験は望ましくない可能性があり、それに対して責任を負いません。</p>
          <p>あくまで一つのユーモアとして捉えられる場合にのみ、プレイをおすすめします。</p>
          <p>推奨プレイ性別：漢（ユーモア表現です。性別による参加制限はありません。）</p>
          <label><input id="dark-consent" name="dark_consent" type="checkbox"> 注意事項を読み、ユーモアとして楽しむことに同意します。</label>
        </div>
      </section>
      <section class="panel"><div class="section-heading"><h2>プレイヤー名（3〜6人）</h2></div>
        <div class="players">${Array.from({length: 6}, (_, i) => `<label><span>プレイヤー${i + 1}${i >= 3 ? "（任意）" : ""}</span><input name="player" maxlength="40" autocomplete="off" value="${i < 3 ? `プレイヤー${String.fromCharCode(65 + i)}` : ""}" placeholder="名前を入力"></label>`).join("")}</div>
        <label class="round-input">ラウンド数 <input name="rounds" type="number" min="1" max="10" value="3" required></label>
        <button class="primary wide" type="submit">ゲーム開始</button>
      </section>
    </form>`;
  const consent = document.querySelector("#dark-consent");
  function updateStartPermission() {
    const selected = document.querySelector('input[name="genre"]:checked');
    const dark = Boolean(state.genres.find(item => item.name === selected.value)?.dark);
    document.querySelector("#dark-warning").hidden = !dark;
    consent.required = dark;
    document.querySelector('#setup-form button[type="submit"]').disabled = dark && !consent.checked;
  }
  consent.addEventListener("change", updateStartPermission);
  document.querySelectorAll('input[name="genre"]').forEach(input => {
    input.addEventListener("change", () => {
      const genre = state.genres.find(item => item.name === input.value);
      document.documentElement.classList.toggle("dark-mode", Boolean(genre && genre.dark));
      consent.checked = false;
      updateStartPermission();
    });
  });
  document.querySelector("#setup-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    updateStartPermission();
    if (document.querySelector('#setup-form button[type="submit"]').disabled) return;
    act("start", {players: form.getAll("player"), genre: form.get("genre"), rounds: Number(form.get("rounds")), dark_consent: consent.checked});
  });
}

function renderHandover() {
  app.innerHTML = `<section class="handover panel"><p class="note">${state.player_number} / ${state.player_count} 人目</p>
    <h1>${E(state.player)} さんの番です</h1>
    <p>画面を交代してください。<br>${state.activity === "submit" ? "準備ができたら、自分の手札を開きましょう。" : "作品を見て、お気に入りに投票しましょう。"}</p>
    <button class="primary" data-action="reveal">${state.activity === "submit" ? "手札を表示" : "投票画面を表示"}</button>
  </section>`;
}

function cardText(card) {
  if (card.line_break === true) return "\n";
  return Object.hasOwn(card, "hand_idx") ? state.hand[card.hand_idx] : card.free_word;
}

function renderSubmit() {
  const hasFree = cards.some(card => Object.hasOwn(card, "free_word"));
  const title = cards.map(cardText).join(" ").replace(/ *\n */g, "\n");
  app.innerHTML = `<div class="page-heading"><h1>${E(state.work_label)}作成</h1><span class="player-badge">プレイヤー：${E(state.player)}</span></div>
    <p class="description">${E(state.description)}</p>
    <section class="preview"><p class="note">${E(state.work_label)}</p><p class="preview-title ${title ? "" : "placeholder"}">${title ? E(title) : "未選択"}</p></section>
    <section class="panel composition"><div class="section-heading"><h2>並べ替えエリア</h2><button data-action="line-break">改行カードを追加</button><span class="note">ドラッグ / ◀ ▶ で移動</span></div>
      <div id="title-cards" class="title-cards">${cards.map((card, i) => `<div class="title-card ${Object.hasOwn(card, "free_word") ? "free-card" : ""}" draggable="true" data-index="${i}"><span class="card-word">${card.line_break ? "↵ 改行" : E(cardText(card))}</span><div class="card-tools"><button data-action="left" data-index="${i}" aria-label="${card.line_break ? "↵ 改行" : E(cardText(card))}を左へ" ${i === 0 ? "disabled" : ""}>◀</button><button data-action="right" data-index="${i}" aria-label="${card.line_break ? "↵ 改行" : E(cardText(card))}を右へ" ${i === cards.length - 1 ? "disabled" : ""}>▶</button><button data-action="remove" data-index="${i}" aria-label="${card.line_break ? "↵ 改行" : E(cardText(card))}を外す">×</button></div></div>`).join("") || '<p class="empty">選んだカードがここに並びます</p>'}</div>
    </section>
    <section class="panel"><div class="section-heading"><h2>あなたの手札</h2><span class="note">0〜7枚、好きな枚数を使えます</span></div>
      <div class="hand">${state.hand.map((word, i) => `<button class="hand-card" data-action="add" data-index="${i}" ${cards.some(card => card.hand_idx === i) ? "disabled" : ""}>${E(word)}</button>`).join("")}</div>
    </section>
    <form id="free-form" class="free-form panel"><label for="free-word"><strong>フリーワード</strong><small>1〜4文字を、必ず1つ。</small></label><input id="free-word" autocomplete="off" value="${E(freeText)}" placeholder="ひとこと" ${hasFree ? "disabled" : ""}><button class="secondary" type="submit" ${hasFree ? "disabled" : ""}>${hasFree ? "追加済み" : "カードにする"}</button></form>
    <div class="submit-row"><p class="note">提出すると、次のプレイヤーに交代します。</p><button class="primary" data-action="submit" ${hasFree ? "" : "disabled"}>決定して提出</button></div>`;
  document.querySelector("#free-word").addEventListener("input", event => { freeText = event.target.value; });
  document.querySelector("#free-form").addEventListener("submit", event => {
    event.preventDefault();
    const word = freeText.trim();
    if ([...word].length < 1 || [...word].length > 4) return showError("フリーワードは1〜4文字で入力してください。");
    if (!hasFree) {
      if (cards.length >= 15) return showError("カードは改行を含め15枚までです。不要な改行を外してください。");
      cards.push({free_word: word});
      showError();
      renderSubmit();
    }
  });
  const zone = document.querySelector("#title-cards");
  zone.addEventListener("dragstart", event => {
    const card = event.target.closest(".title-card");
    if (!card) return;
    dragIndex = Number(card.dataset.index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(dragIndex));
    card.classList.add("dragging");
  });
  zone.addEventListener("dragover", event => {
    if (dragIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  zone.addEventListener("drop", event => {
    event.preventDefault();
    if (dragIndex === null) return;
    const target = event.target.closest(".title-card");
    let destination = target ? Number(target.dataset.index) : cards.length;
    if (target && event.clientX > target.getBoundingClientRect().left + target.offsetWidth / 2) destination++;
    const [card] = cards.splice(dragIndex, 1);
    if (destination > dragIndex) destination--;
    cards.splice(destination, 0, card);
    dragIndex = null;
    renderSubmit();
  });
  zone.addEventListener("dragend", () => {
    dragIndex = null;
    document.querySelectorAll(".dragging").forEach(card => card.classList.remove("dragging"));
  });
}

function renderVote() {
  const key = `${state.genre}:${state.round}:${state.titles.map(item => item.title).join("|")}`;
  if (presentationKey !== key) {
    presentationKey = key;
    revealed = state.titles.map(() => 0);
    ballot = [];
  }
  const parts = state.titles.map(item => item.parts || [item.title]);
  const complete = parts.every((list, i) => revealed[i] >= list.length);
  app.innerHTML = `<h1>作品発表・みんなで投票</h1><p class="criterion">${E(state.criterion)}</p>
    <p class="note">「次のカード」で一枚ずつ発表します。全作品の発表後に投票できます。</p>
    <div class="vote-list">${state.titles.map((item, i) => `<section class="panel"><strong>作品 ${i + 1}</strong>
      <p class="presentation-title" aria-live="polite">${parts[i].slice(0, revealed[i]).map((part, index) => part === "\n" ? '<br>' : `<span class="reveal-card ${index === item.free_index ? "revealed-free" : ""}">${E(part)}${index === item.free_index ? '<small class="free-label">フリー</small>' : ''}</span>`).join(" ") || 'まだ発表していません'}</p>
      <button data-action="reveal-card" data-index="${i}" ${revealed[i] >= parts[i].length ? 'disabled' : ''}>次のカード（${revealed[i]} / ${parts[i].length}）</button></section>`).join("")}</div>
    ${complete ? `<form id="vote-form" class="panel shared-ballot"><h2>全員の投票</h2><p class="note">一人一票。自分の作品には投票できません。全員が選んだら確定してください。</p>
      ${state.voters.map((voter, i) => `<fieldset><legend>${E(voter.name)}</legend>${state.titles.map(item => `<label><input type="radio" name="voter-${i}" value="${item.id}" ${item.id === voter.self_id ? 'disabled' : 'required'} ${ballot[i] === item.id ? 'checked' : ''}>作品 ${item.id + 1}${item.id === voter.self_id ? '（自分）' : ''}</label>`).join("")}</fieldset>`).join("")}
      <button class="primary" type="submit">全員の投票を確定</button></form>` : ''}`;
  document.querySelectorAll('[data-action="reveal-card"]').forEach(button => button.addEventListener('click', () => {
    revealed[Number(button.dataset.index)]++;
    renderVote();
  }));
  const form = document.querySelector('#vote-form');
  if (form) {
    form.addEventListener('change', () => {
      const data = new FormData(form);
      ballot = state.voters.map((_, i) => data.has(`voter-${i}`) ? Number(data.get(`voter-${i}`)) : undefined);
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      act('vote_all', {votes: state.voters.map((_, i) => Number(data.get(`voter-${i}`)))});
    });
  }
}

function renderResults() {
  app.innerHTML = `<div class="page-heading"><h1>第${state.round}ラウンドの結果</h1></div>
    <div class="results-list">${state.results.map(item => `<article class="result panel"><div class="result-meta"><strong>${E(item.player)}</strong><span><b>${item.votes}</b> 票 · 累計 ${item.accumulated_score} 点</span></div><p class="result-title">${E(item.title)}</p>${freeWordNote(item)}<small class="note">${item.voters.length ? `投票：${item.voters.map(E).join("、")}` : "投票なし"}</small></article>`).join("")}</div>
    <div class="submit-row"><span></span><button class="primary" data-action="next">${state.round < state.rounds ? "次のラウンドへ" : "最終順位を見る"}</button></div>`;
}

function renderFinal() {
  app.innerHTML = `<div class="final-heading"><h1>最終順位</h1><p>全${state.rounds}ラウンド終了</p></div>
    <div class="rankings">${state.rankings.map(item => `<div class="ranking panel ${item.rank === 1 ? "winner" : ""}"><span class="rank">${item.rank}<small>位</small></span><strong>${E(item.player)}</strong><span class="score">${item.score}<small>点</small></span></div>`).join("")}</div>
    <div class="submit-row"><button class="primary" data-action="save-image">結果を画像保存（PNG）</button><button class="primary" data-action="reset">もう一度遊ぶ <span>↗</span></button></div>
    <div class="final-works">${(state.history || []).map(round => `<section class="round-archive"><h2>第${round.round}ラウンドの作品</h2><div class="results-list">${round.results.map(item => `<article class="result panel"><div class="result-meta"><strong>${E(item.player)}</strong><span>${item.votes} 票</span></div><p class="result-title">${E(item.title)}</p>${freeWordNote(item)}</article>`).join("")}</div></section>`).join("")}</div>`;
}

function freeWordNote(item) {
  return item.free_word === undefined ? '' : `<p class="free-word-note">フリーワード：<strong>${E(item.free_word)}</strong></p>`;
}

async function saveResultsImage() {
  const button = document.querySelector('[data-action="save-image"]');
  button.disabled = true;
  showError();
  try {
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("このブラウザでは画像を作成できません。");
    const rows = [];
    const width = 1200, margin = 60;
    function add(text, size = 28, bold = false, gap = 12) {
      context.font = `${bold ? "bold " : ""}${size}px Arial, Meiryo, sans-serif`;
      for (const paragraph of String(text).split("\n")) {
        let line = "";
        for (const char of paragraph) {
          if (line && context.measureText(line + char).width > width - margin * 2) {
            rows.push({text: line, size, bold, gap: 0});
            line = "";
          }
          line += char;
        }
        rows.push({text: line, size, bold, gap: 0});
      }
      rows[rows.length - 1].gap = gap;
    }
    add("タイトル決めゲーム — 最終結果", 40, true, 20);
    add(`${state.genre} / 全${state.rounds}ラウンド`, 26, false, 28);
    add("最終順位", 32, true);
    state.rankings.forEach(item => add(`${item.rank}位　${item.player}　${item.score}点`, 28));
    for (const round of state.history || []) {
      add(`第${round.round}ラウンドの作品`, 32, true, 20);
      for (const item of round.results) {
        add(`${item.player}　—　${item.votes}票`, 26, true, 6);
        add(item.title, 30, false, 8);
        if (item.free_word !== undefined) add(`フリーワード：${item.free_word}`, 24, true, 24);
      }
    }
    canvas.width = width;
    canvas.height = Math.ceil(margin * 2 + rows.reduce((height, row) => height + row.size * 1.6 + row.gap, 0));
    context.fillStyle = state.dark ? "#181818" : "#f7f7f7";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = state.dark ? "#eeeeee" : "#111111";
    context.textBaseline = "top";
    let y = margin;
    for (const row of rows) {
      context.font = `${row.bold ? "bold " : ""}${row.size}px Arial, Meiryo, sans-serif`;
      context.fillText(row.text, margin, y);
      y += row.size * 1.6 + row.gap;
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("画像の作成に失敗しました。");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `title-game-results-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    showError(error.message || "画像を保存できませんでした。");
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

app.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled || pending) return;
  const action = button.dataset.action;
  const idx = Number(button.dataset.index);
  if (action === "reload") return load();
  if (action === "save-image") return saveResultsImage();
  if (["reveal", "next", "reset"].includes(action)) return act(action);
  if (action === "reveal-card") return;
  if (action === "submit") return act("submit", {cards});
  if (action === "line-break") {
    if (cards.length >= 15) return showError("カードは改行を含め15枚までです。");
    cards.push({line_break: true});
  } else if (action === "add") {
    if (cards.length >= 15) return showError("カードは改行を含め15枚までです。不要な改行を外してください。");
    if (!cards.some(card => card.hand_idx === idx)) cards.push({hand_idx: idx});
  } else if (action === "remove") {
    cards.splice(idx, 1);
  } else if (action === "left" || action === "right") {
    const to = idx + (action === "left" ? -1 : 1);
    if (to >= 0 && to < cards.length) [cards[idx], cards[to]] = [cards[to], cards[idx]];
  } else return;
  showError();
  renderSubmit();
});

resetButton.addEventListener("click", () => {
  if (window.confirm("進行中のゲームを終了して、設定に戻りますか？")) act("reset");
});

load();
