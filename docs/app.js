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
  return Object.hasOwn(card, "hand_idx") ? state.hand[card.hand_idx] : card.free_word;
}

function renderSubmit() {
  const hasFree = cards.some(card => Object.hasOwn(card, "free_word"));
  const title = cards.map(cardText).join(" ");
  app.innerHTML = `<div class="page-heading"><h1>${E(state.work_label)}作成</h1><span class="player-badge">プレイヤー：${E(state.player)}</span></div>
    <p class="description">${E(state.description)}</p>
    <section class="preview"><p class="note">${E(state.work_label)}</p><p class="preview-title ${title ? "" : "placeholder"}">${title ? E(title) : "未選択"}</p></section>
    <section class="panel composition"><div class="section-heading"><h2>並べ替えエリア</h2><span class="note">ドラッグ / ◀ ▶ で移動</span></div>
      <div id="title-cards" class="title-cards">${cards.map((card, i) => `<div class="title-card ${Object.hasOwn(card, "free_word") ? "free-card" : ""}" draggable="true" data-index="${i}"><span class="card-word">${E(cardText(card))}</span><div class="card-tools"><button data-action="left" data-index="${i}" aria-label="${E(cardText(card))}を左へ" ${i === 0 ? "disabled" : ""}>◀</button><button data-action="right" data-index="${i}" aria-label="${E(cardText(card))}を右へ" ${i === cards.length - 1 ? "disabled" : ""}>▶</button><button data-action="remove" data-index="${i}" aria-label="${E(cardText(card))}を外す">×</button></div></div>`).join("") || '<p class="empty">選んだカードがここに並びます</p>'}</div>
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
  app.innerHTML = `<div class="page-heading"><h1>投票</h1><span class="player-badge">投票者：${E(state.player)}</span></div>
    <p class="criterion">${E(state.criterion)}</p><form id="vote-form"><div class="vote-list">${state.titles.map((item, i) => `<label class="vote-option ${item.is_self ? "self" : ""}"><input type="radio" name="title" value="${item.id}" ${item.is_self ? "disabled" : "required"}><span class="vote-number">${String(i + 1).padStart(2, "0")}</span><span class="vote-text">${E(item.title)}${item.is_self ? '<small>自分の作品 · 投票できません</small>' : ""}</span></label>`).join("")}</div><div class="submit-row"><p class="note">作者は、結果発表までのお楽しみ。</p><button class="primary" type="submit">投票する <span>→</span></button></div></form>`;
  document.querySelector("#vote-form").addEventListener("submit", event => {
    event.preventDefault();
    const chosen = new FormData(event.currentTarget).get("title");
    if (chosen === null) return showError("投票する作品を選んでください。");
    act("vote", {title_id: Number(chosen)});
  });
}

function renderResults() {
  app.innerHTML = `<div class="page-heading"><h1>第${state.round}ラウンドの結果</h1></div>
    <div class="results-list">${state.results.map(item => `<article class="result panel"><div class="result-meta"><strong>${E(item.player)}</strong><span><b>${item.votes}</b> 票 · 累計 ${item.accumulated_score} 点</span></div><p class="result-title">${E(item.title)}</p><small class="note">${item.voters.length ? `投票：${item.voters.map(E).join("、")}` : "投票なし"}</small></article>`).join("")}</div>
    <div class="submit-row"><span></span><button class="primary" data-action="next">${state.round < state.rounds ? "次のラウンドへ" : "最終順位を見る"}</button></div>`;
}

function renderFinal() {
  app.innerHTML = `<div class="final-heading"><h1>最終順位</h1><p>全${state.rounds}ラウンド終了</p></div>
    <div class="rankings">${state.rankings.map(item => `<div class="ranking panel ${item.rank === 1 ? "winner" : ""}"><span class="rank">${item.rank}<small>位</small></span><strong>${E(item.player)}</strong><span class="score">${item.score}<small>点</small></span></div>`).join("")}</div><div class="submit-row"><span></span><button class="primary" data-action="reset">もう一度遊ぶ <span>↗</span></button></div>`;
}

app.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled || pending) return;
  const action = button.dataset.action;
  const idx = Number(button.dataset.index);
  if (action === "reload") return load();
  if (["reveal", "next", "reset"].includes(action)) return act(action);
  if (action === "submit") return act("submit", {cards});
  if (action === "add") {
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
