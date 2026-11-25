// 공공디자인 AI 툴킷 for 인천
// 키오스크처럼 한 단계씩 고르고(누구를, 어디에, 무엇을, 어떻게), 마지막에 사업 기획안을 만든다.
// 단계마다 목록에 없는 것은 「기타」 칸에 직접 적을 수 있다. 공간 구성 요소는 기획안에서 AI가 제안한다.
// AI 도우미는 시연용 규칙 기반 추천이다(선택지마다 정해 둔 연관 관계로 점수를 매김). 실제 AI에 넘길 프롬프트도 만든다.
(function () {
  const T = window.TOOLKIT, P = window.PALETTE, CR = window.CREDITS || [];
  const app = document.getElementById("app");
  const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const WHO = by(T.who), WHERE = by(T.where), HOW = by(T.how), EL = by(T.elements), TH = by(P.themes);
  const STEPS = T.steps;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const photo = (id) => `assets/photo/${id}.jpg`;

  // 받침 유무로 조사 고르기
  const hasJong = (w) => { const c = String(w ?? "").trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false; };
  const j = (w, a, b) => w + (hasJong(w) ? a : b); // j("고령자","을","를")
  const jb = (w, a, b) => `<b>${esc(w)}</b>${hasJong(w) ? a : b}`; // 굵게 + 조사
  const andList = (names) => {
    names = names.filter(Boolean);
    if (names.length <= 1) return names[0] || "";
    const head = names.slice(0, -1).join(", ");
    const last = names[names.length - 1];
    return (names.length > 2 ? head : names[0]) + (hasJong(names[names.length - 2]) ? "과 " : "와 ") + last;
  };

  // 상태: 고른 항목(배열)과 「기타」에 적은 글(문자열)
  const empty = () => ({ who: [], where: [], theme: [], issue: [], how: [], whoX: "", whereX: "", whatX: "", howX: "" });
  const fill = (s) => { const e = empty(); for (const k of Object.keys(e)) if (s && typeof s[k] === typeof e[k] && Array.isArray(s[k]) === Array.isArray(e[k])) e[k] = s[k]; return e; };
  let S = fill(load());
  function save() { try { localStorage.setItem("ipd-toolkit", JSON.stringify(S)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem("ipd-toolkit")); } catch (e) { return null; } }
  function encode() {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(S)) {
      if (Array.isArray(v)) { if (v.length) q.set(k, v.join(",")); }
      else if (String(v).trim()) q.set(k, String(v).trim());
    }
    return q.toString();
  }
  function decode(qs) {
    const q = new URLSearchParams(qs), s = empty();
    for (const k of Object.keys(s)) if (q.get(k)) s[k] = Array.isArray(s[k]) ? q.get(k).split(",").filter(Boolean) : q.get(k);
    return s;
  }
  const X = (k, st = S) => String(st[k + "X"] || "").trim();

  // 단계 완료 여부
  const ready = {
    who: () => S.who.length > 0 || !!X("who"),
    where: () => S.where.length > 0 || !!X("where"),
    what: () => (S.theme.length > 0 && S.issue.length > 0) || !!X("what"),
    how: () => S.how.length > 0 || !!X("how"),
  };
  const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);
  const canEnter = (id) => STEPS.slice(0, stepIndex(id)).every((s) => !ready[s.id] || ready[s.id]());
  const nextOf = (id) => { const i = stepIndex(id); return i === STEPS.length - 1 ? "result" : STEPS[i + 1].id; };

  // AI 추천 점수: 앞에서 고른 항목들이 가리키는 연관 목록에 몇 번 들어 있는가
  function prefs(key, st = S) {
    const out = {};
    const add = (ids, w = 1) => (ids || []).forEach((id) => (out[id] = (out[id] || 0) + w));
    st.who.forEach((id, i) => add(WHO[id] && WHO[id][key], i === 0 ? 2 : 1));
    st.where.forEach((id) => add(WHERE[id] && WHERE[id][key], 2));
    st.theme.forEach((id) => add(T.themeMeta[id] && T.themeMeta[id][key], 1.5));
    st.how.forEach((id) => add(HOW[id] && HOW[id][key], 2));
    return out;
  }
  function recommend(key, pool, n = 3, exclude = [], st = S) {
    const sc = prefs(key, st);
    return pool.map((o) => o.id).filter((id) => sc[id] && !exclude.includes(id))
      .sort((a, b) => sc[b] - sc[a]).slice(0, n);
  }
  const names = (ids, M) => ids.map((id) => M[id] && M[id].name).filter(Boolean);
  const whoNames = () => [...names(S.who, WHO), X("who")].filter(Boolean);
  // 앞에서 고른 장소를 자주 쓰는 사람(who.where 목록에서 앞에 있을수록 먼저)
  const whoForWhere = () => { const w = S.where[0]; if (!w) return [];
    return T.who.filter((o) => (o.where || []).includes(w)).sort((a, b) => a.where.indexOf(w) - b.where.indexOf(w)).map((o) => o.id).slice(0, 3); };
  const whereName = () => (S.where[0] && WHERE[S.where[0]] ? WHERE[S.where[0]].name : X("where"));
  const ampOf = () => { const amp = []; S.who.forEach((w) => (WHO[w].amp || []).forEach((a) => !S.who.includes(a) && !amp.includes(a) && amp.push(a))); return amp; };

  // 아이콘
  const ICON = T.icons;
  const svg = (k) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">${ICON[k] || ICON.dot}</svg>`;
  const pic = (o) => (o && o.photo ? `<img src="${photo(o.photo)}" alt="">` : svg("etc"));
  const AI_MARK = `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="7" height="7" fill="currentColor"/><rect x="11" y="2" width="7" height="7" fill="currentColor" opacity=".45"/><rect x="2" y="11" width="7" height="7" fill="currentColor" opacity=".45"/><rect x="11" y="11" width="7" height="7" fill="currentColor"/></svg>`;

  // ---------- 화면 공통 ----------
  function setMenu(m) { document.querySelectorAll(".menu a").forEach((a) => a.classList.toggle("on", a.dataset.m === m)); }

  function progress(cur) {
    const all = [...STEPS, { id: "result", label: "기획안" }];
    return `<nav class="prog" aria-label="단계">${all.map((s, i) => {
      const done = s.id !== "result" && ready[s.id] && ready[s.id]() && s.id !== cur;
      const ok = s.id === "result" ? STEPS.every((x) => ready[x.id]()) : canEnter(s.id);
      return `<a href="#/${s.id}" class="${s.id === cur ? "now" : done ? "done" : ""} ${ok ? "" : "lock"}"><i>${done ? "✓" : i + 1}</i>${esc(s.label)}</a>`;
    }).join("")}</nav>`;
  }

  function trayItems() {
    const it = [];
    S.where.forEach((id) => WHERE[id] && it.push({ k: "어디에", n: WHERE[id].name, img: photo(WHERE[id].photo) }));
    if (X("where")) it.push({ k: "어디에", n: X("where"), icon: "etc" });
    S.who.forEach((id) => WHO[id] && it.push({ k: "누구를", n: WHO[id].name, img: photo(WHO[id].photo) }));
    if (X("who")) it.push({ k: "누구를", n: X("who"), icon: "etc" });
    const th = TH[S.theme[0]];
    if (th) it.push({ k: "무엇을", n: S.issue[0] ? issueOf(S.issue[0]).name : X("what") || th.name, img: photo(T.themeMeta[th.id].photo) });
    else if (X("what")) it.push({ k: "무엇을", n: X("what"), icon: "etc" });
    S.how.forEach((id) => HOW[id] && it.push({ k: "어떻게", n: HOW[id].name, img: photo(HOW[id].photo) }));
    if (X("how")) it.push({ k: "어떻게", n: X("how"), icon: "etc" });
    return it;
  }
  function bar(cur) {
    const it = trayItems();
    const i = stepIndex(cur);
    const prev = i <= 0 ? "#/intro" : `#/${STEPS[i - 1].id}`;
    const nextId = nextOf(cur);
    const ok = ready[cur]();
    return `<div class="bar">
      <div class="tray"><span class="tray-l">내 선택</span>${it.length ? it.map((x) =>
        `<span class="chip">${x.img ? `<img src="${x.img}" alt="">` : `<span class="ic">${svg(x.icon)}</span>`}<span><small>${x.k}</small>${esc(x.n)}</span></span>`).join("")
        : `<span class="none">아직 고른 것이 없습니다</span>`}</div>
      <div class="nav-b"><a class="btn ghost" href="${prev}">이전</a>
      <a class="btn fill" href="#/${nextId}" ${ok ? "" : "disabled aria-disabled=\"true\""}>${nextId === "result" ? "기획안 만들기" : "다음"} ›</a></div>
    </div>`;
  }

  function optBtn(o, key, img, selected, recs, extraSub) {
    const k = selected.indexOf(o.id);
    return `<button class="opt" data-k="${key}" data-id="${o.id}" aria-pressed="${k >= 0}">
      <span class="ord">${k >= 0 ? k + 1 : ""}</span>
      <span class="dot">${img}</span>
      <span class="nm">${esc(o.name)}</span>
      ${extraSub !== undefined ? extraSub : o.sub ? `<span class="sb">${esc(o.sub)}</span>` : ""}
      ${recs.includes(o.id) ? `<span class="rec">AI 추천</span>` : ""}
    </button>`;
  }

  // 「기타: ___」 직접 입력 칸
  const etcInput = (k, ph) => `<label class="etc"><span>기타</span><input type="text" data-etc="${k}" value="${esc(S[k + "X"])}" placeholder="${esc(ph)}" maxlength="30" enterkeyhint="next" autocomplete="off"></label>`;

  function issueOf(key) { const [t, n] = key.split(":"); const th = TH[t]; const is = th.issues[+n]; return { theme: th, name: is[0], a: is[1], b: is[2] }; }

  // ---------- 단계 화면 ----------
  function stepScreen(id) {
    const st = STEPS[stepIndex(id)];
    let opts = "", aiMsg = "", aiBtn = "";
    if (id === "who") {
      const recs = S.who.length ? ampOf().slice(0, 3) : whoForWhere();
      const wh = whereName();
      opts = T.who.map((o) => optBtn(o, "who", `<img src="${photo(o.photo)}" alt="" loading="lazy">`, S.who, recs)).join("")
        + etcInput("who", "예: 배달 노동자");
      if (S.who.length) {
        const m = WHO[S.who[0]];
        aiMsg = `<b>${esc(m.name)}</b>: ${esc(m.need)}`;
        if (recs.length && S.who.length < st.max) { aiMsg += `<br><span class="think">같은 공간을 함께 쓰는 <b>${esc(andList(names(recs, WHO)))}</b>도 함께 생각해 보면 어떨까요?</span>`; aiBtn = `<button class="btn" data-ai="who">AI 추천 대상 더하기</button>`; }
      } else if (X("who")) aiMsg = `<b>${esc(X("who"))}</b>: 목록에 없는 대상입니다. 이 사람의 하루와 불편을 모둠에서 먼저 이야기해 보세요.<br><span class="think">같은 공간을 함께 쓰는 사람을 목록에서 더 골라도 됩니다.</span>`;
      else {
        aiMsg = recs.length
          ? `${jb(wh, "을", "를")} 자주 쓰는 사람으로 <b>${esc(andList(names(recs, WHO)))}</b>${hasJong(names(recs, WHO).slice(-1)[0]) ? "을" : "를"} 추천합니다. <b>주 대상</b>을 먼저 고르고, 함께 쓰는 사람을 <b>두 명까지</b> 더해 보세요.`
          : `${wh ? `${jb(wh, "을", "를")} 쓰는 사람을 떠올려 보세요. ` : ""}<b>주 대상</b>을 먼저 고르고, 같은 공간을 함께 쓰는 사람을 <b>두 명까지</b> 더해 보세요. 목록에 없으면 기타에 적어 주세요.`;
        if (recs.length) aiBtn = `<button class="btn" data-ai="who">AI 추천으로 고르기</button>`;
      }
    }
    if (id === "where") {
      const recs = recommend("where", T.where);
      const wn = andList(whoNames());
      opts = T.where.map((o) => optBtn(o, "where", `<img src="${photo(o.photo)}" alt="" loading="lazy">`, S.where, recs)).join("")
        + etcInput("where", "예: 아파트 단지 앞 공터");
      if (S.where.length) { const w = WHERE[S.where[0]]; aiMsg = `<b>${esc(w.name)}</b>: ${esc(w.issue)}`; }
      else if (X("where")) aiMsg = `<b>${esc(X("where"))}</b>: 직접 적은 장소입니다. 이곳을 쓰는 사람과 그들이 겪는 불편을 떠올려 보세요.`;
      else if (recs.length && wn) aiMsg = `${jb(wn, "이", "가")} 자주 머무는 곳으로 ${jb(andList(names(recs, WHERE)), "을", "를")} 추천합니다. 공공공간을 넓게 보고 골라 보세요.`;
      else aiMsg = `우리 동네에서 바꾸고 싶은 곳을 먼저 고르세요. 다음 단계에서 그곳을 쓰는 사람을 AI가 추천합니다. 목록에 없으면 기타에 적어 주세요.`;
      if (!S.where.length && !X("where") && recs.length && wn) aiBtn = `<button class="btn" data-ai="where">AI 추천으로 고르기</button>`;
    }
    if (id === "what") {
      const recs = recommend("themes", P.themes);
      opts = P.themes.map((o) => optBtn({ ...o, sub: o.slogan }, "theme", `<img src="${photo(T.themeMeta[o.id].photo)}" alt="" loading="lazy">`, S.theme, recs)).join("");
      if (S.theme.length) {
        const th = TH[S.theme[0]];
        const recI = recommendIssue(th);
        opts += `<div class="sub"><p class="sub-t">${esc(th.name)} 주제의 인천 이슈 / 하나를 고르세요</p><div class="issues">${th.issues.map((is, n) => {
          const key = `${th.id}:${n}`;
          return `<button class="iss" data-k="issue" data-id="${key}" aria-pressed="${S.issue.includes(key)}"><b>${esc(is[0])}${n === recI ? ` <span class="rec" style="display:inline;font-size:13px;color:var(--ac)">AI 추천</span>` : ""}</b><span>${esc(is[1])}</span></button>`;
        }).join("")}</div></div>`;
      }
      opts += etcInput("what", "예: 불법 주차");
      if (X("what")) aiMsg = `<b>${esc(X("what"))}</b>: 시민이 직접 적은 과제로 기획안에 담습니다.<br><span class="think">${S.theme.length ? `${esc(TH[S.theme[0]].name)} 주제와 함께 엮습니다.` : "위에서 주제를 함께 고르면 인천 창의디자인 팔레트 사업과 더 잘 이어집니다."}</span>`;
      else if (!S.theme.length) aiMsg = recs.length
        ? `인천 공공디자인 진흥계획은 6개 주제와 30개 이슈를 정리했습니다. 지금 조합에는 <b>${esc(andList(names(recs, TH)))}</b> 주제가 잘 맞습니다.`
        : `인천 공공디자인 진흥계획은 6개 주제와 30개 이슈를 정리했습니다. 우리 대상지에 맞는 주제를 골라 보세요.`;
      else if (!S.issue.length) aiMsg = `<b>${esc(TH[S.theme[0]].slogan)}</b>. 아래 다섯 이슈 가운데 우리 대상지에 가장 가까운 것을 고르세요. 없으면 기타에 적어 주세요.`;
      else { const is = issueOf(S.issue[0]); aiMsg = `<b>${esc(is.name)}</b>: ${esc(is.a)}. ${esc(is.b)}.<br><span class="think">인천 공공디자인 진흥계획 중간보고의 근거입니다.</span>`; }
      if (!S.issue.length && !X("what")) aiBtn = `<button class="btn" data-ai="what">AI 추천으로 고르기</button>`;
    }
    if (id === "how") {
      const recs = recommend("how", T.how);
      opts = T.how.map((o) => optBtn(o, "how", `<img src="${photo(o.photo)}" alt="" loading="lazy">`, S.how, recs)).join("")
        + etcInput("how", "예: 야간 순찰 연계");
      if (S.how.length) {
        const h = HOW[S.how[0]]; aiMsg = `<b>${esc(h.name)}</b>: ${esc(h.desc)}`;
        if (S.how[1]) aiMsg += `<br><span class="think">${esc(HOW[S.how[1]].name)} 전략을 더해 ${esc(HOW[S.how[1]].goal)}.</span>`;
        if (X("how")) aiMsg += `<br><span class="think">직접 적은 ‘${esc(X("how"))}’ 전략도 함께 담습니다.</span>`;
      } else if (X("how")) aiMsg = `<b>${esc(X("how"))}</b>: 직접 적은 전략입니다. 이 전략이 사람의 행동을 어떻게 바꿀지 모둠에서 이야기해 보세요.`;
      else aiMsg = recs.length
        ? `디자인 전략은 공간이 사람의 행동을 어떻게 바꿀지 정하는 방법입니다. 이 조합에는 <b>${esc(andList(names(recs, HOW)))}</b> 전략을 추천합니다. 두 개까지 섞을 수 있습니다.`
        : `디자인 전략은 공간이 사람의 행동을 어떻게 바꿀지 정하는 방법입니다. 두 개까지 고르거나 기타에 직접 적어 보세요.`;
      if (ready.how()) aiMsg += `<br><span class="think">기획안을 만들면 AI가 공간을 채울 요소까지 제안합니다.</span>`;
      if (!S.how.length && !X("how") && recs.length) aiBtn = `<button class="btn" data-ai="how">AI 추천으로 고르기</button>`;
    }
    return `<section class="screen">${progress(id)}
      <div class="stage">
        <div class="ask">
          <p class="kicker">Step ${stepIndex(id) + 1} / ${esc(st.en)}</p>
          <h2>${esc(st.title)}</h2>
          <p class="lead">${esc(st.lead)}</p>
          <div class="ai"><p class="ai-l">${AI_MARK}AI 도우미</p><p>${aiMsg}</p>${aiBtn}</div>
          <p class="rule">${esc(st.rule)}</p>
        </div>
        <div class="opts">${opts}</div>
      </div>${bar(id)}</section>`;
  }

  function recommendIssue(th) {
    // 대상지와 대상의 낱말이 이슈 글에 얼마나 겹치는가로 하나를 고른다
    const words = [...S.where.map((id) => WHERE[id].kw || []), ...S.who.map((id) => WHO[id].kw || []), X("who"), X("where")].flat().filter(Boolean);
    let best = 0, bs = -1;
    th.issues.forEach((is, n) => { const t = is.join(" "); const s = words.filter((w) => t.includes(w)).length; if (s > bs) { bs = s; best = n; } });
    return best;
  }

  // 입력 중에는 화면 전체를 다시 그리지 않고 진행 표시, AI 도우미, 아래 막대, 선택 표시만 고친다(입력 칸의 커서를 지킴)
  function patch() {
    const r = location.hash.replace(/^#\/?/, "").split("?")[0];
    if (!ready[r]) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = stepScreen(r);
    for (const sel of [".prog", ".ai", ".bar"]) { const a = app.querySelector(sel), b = tmp.querySelector(sel); if (a && b) a.replaceWith(b); }
    app.querySelectorAll("[data-k]").forEach((btn) => {
      const n = tmp.querySelector(`[data-k="${btn.dataset.k}"][data-id="${CSS.escape(btn.dataset.id)}"]`);
      if (n) btn.replaceWith(n);
    });
  }

  app.addEventListener("input", (e) => {
    const t = e.target.closest("[data-etc]");
    if (!t) return;
    const k = t.dataset.etc;
    S[k + "X"] = t.value;
    // 하나만 고르는 자리(어디에, 무엇을의 이슈)는 직접 적으면 목록 선택을 비운다
    if (t.value.trim()) { if (k === "where") S.where = []; if (k === "what") S.issue = []; }
    save(); patch();
  });
  app.addEventListener("keydown", (e) => {
    const t = e.target.closest("[data-etc]");
    if (!t || e.key !== "Enter" || e.isComposing) return;
    const k = t.dataset.etc;
    if (ready[k]()) location.hash = `#/${nextOf(k)}`;
  });

  // 선택 처리
  app.addEventListener("click", (e) => {
    const o = e.target.closest("[data-k]");
    if (o) {
      const k = o.dataset.k, id = o.dataset.id;
      const max = { who: 3, where: 1, theme: 1, issue: 1, how: 2 }[k];
      const arr = S[k];
      const at = arr.indexOf(id);
      if (at >= 0) arr.splice(at, 1);
      else if (max === 1) arr.splice(0, arr.length, id);
      else if (arr.length < max) arr.push(id);
      else { toast(`최대 ${max}개까지 고를 수 있습니다`); return; }
      if (at < 0 && k === "where") S.whereX = "";
      if (at < 0 && k === "issue") S.whatX = "";
      if (k === "theme") S.issue = [];
      save(); render();
      return;
    }
    const ai = e.target.closest("[data-ai]");
    if (ai) {
      const k = ai.dataset.ai;
      if (k === "who") { if (S.who.length) S.who.push(...ampOf().slice(0, 3 - S.who.length)); else S.who = whoForWhere().slice(0, 1); }
      if (k === "where") { S.where = recommend("where", T.where, 1); S.whereX = ""; }
      if (k === "what") { if (!S.theme.length) S.theme = recommend("themes", P.themes, 1); if (!S.theme.length) S.theme = [P.themes[0].id]; S.issue = [`${S.theme[0]}:${recommendIssue(TH[S.theme[0]])}`]; S.whatX = ""; }
      if (k === "how") S.how = recommend("how", T.how, 1);
      save(); render();
      return;
    }
    const act = e.target.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "reset") { S = empty(); save(); location.hash = "#/where"; }
      if (a === "print") window.print();
      if (a === "copy") copy(sheetText(), "기획안 글을 복사했습니다");
      if (a === "share") copy(location.href.split("#")[0] + "#/result?" + encode(), "이 기획안 주소를 복사했습니다");
      if (a === "p1") copy(document.getElementById("p1").textContent, "이미지 프롬프트를 복사했습니다");
      if (a === "p2") copy(document.getElementById("p2").textContent, "기획안 프롬프트를 복사했습니다");
      if (a === "case") { S = fill(JSON.parse(JSON.stringify(T.cases[+act.dataset.i].s))); save(); location.hash = "#/result"; }
    }
  });

  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg), () => {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); toast(msg);
    });
  }
  let tt;
  function toast(msg) { document.querySelector(".toast")?.remove(); const d = document.createElement("div"); d.className = "toast"; d.textContent = msg; document.body.appendChild(d); clearTimeout(tt); tt = setTimeout(() => d.remove(), 2200); }

  // ---------- 사업 기획안 ----------
  // 「기타」에 적은 글을 선택지와 같은 모양으로 바꾼다
  const etcWho = (t) => ({ name: t, photo: "", kw: [t], need: `${j(t, "이", "가")} 이 공간에서 겪는 불편은 현장 관찰과 인터뷰로 확인합니다.`, goal: `${j(t, "이", "가")} 불편 없이 공간을 쓸 수 있게 합니다` });
  const etcWhere = (t) => ({ name: t, short: t, photo: "", type: "", kw: [t], issue: `${t}의 이용 현황과 문제 지점은 현장 조사로 확인합니다.` });
  const etcIssue = (t) => ({ name: t, a: "시민디자인단이 직접 제기한 과제입니다", b: "현장 조사와 관련 부서 협의로 근거를 보완합니다" });
  const etcHow = (t) => ({ name: t, adj: t, noun: "공간", photo: "", desc: "시민디자인단이 직접 제안한 전략입니다.", goal: `${t} 방식으로 과제를 풉니다` });

  function planOf(st) {
    const who = st.who.map((id) => WHO[id]).filter(Boolean);
    if (X("who", st)) who.push(etcWho(X("who", st)));
    const where = WHERE[st.where[0]] || etcWhere(X("where", st));
    const is = st.issue[0] ? issueOf(st.issue[0]) : etcIssue(X("what", st));
    const th = TH[st.theme[0]] || { id: "", name: "시민 제안 과제", slogan: `${is.name} 해결`, desc: `${j(is.name, "을", "를")} 공공디자인으로 풉니다` };
    const meta = T.themeMeta[th.id] || { kw: "", photo: "", el: [] };
    const how = st.how.map((id) => HOW[id]).filter(Boolean);
    if (X("how", st)) how.push(etcHow(X("how", st)));
    // 공간 구성 요소는 앞의 선택으로 AI가 제안한다
    let elIds = recommend("el", T.elements, 4, [], st);
    if (!elIds.length) elIds = (meta.el.length ? meta.el : ["bench", "shade", "sign"]).slice(0, 3);
    const els = elIds.map((id) => EL[id]);
    const w0 = who[0], h0 = how[0], e0 = els[0];
    const t1 = [`${j(w0.name, "을", "를")} 위한`, h0.adj, meta.kw, where.short].filter(Boolean).join(" ");
    const t2 = `${e0.phrase} ${h0.noun} 디자인`;
    const whoAll = andList(who.map((x) => x.name));
    const one = `${where.name}에서 ${j(whoAll, "이", "가")} 겪는 ‘${is.name}’ 과제를 ${andList(how.map((x) => x.name))} 전략으로 풀어 ${th.id ? `‘${th.slogan}’${hasJong(th.slogan) ? "을" : "를"} 만드는 ` : "가는 "}사업입니다.`;
    // 인천 팔레트 연계 사업: 같은 주제 우선, 낱말 겹침으로 정렬
    const words = [where.short, ...where.kw || [], ...els.map((x) => x.name), ...how.map((x) => x.noun), ...who.flatMap((x) => x.kw || []), ...is.name.split(/[ ,()]+/).filter((x) => x.length > 1)];
    const linked = P.projects.map((p) => {
      const t = p[2] + p[4];
      return { p, s: (p[1] === th.id ? 1.5 : 0) + words.filter((wd) => wd && t.includes(wd)).length + p[0] / 1000 * -1 };
    }).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.p);
    const type = P.types.find((t) => t[0] === where.type);
    return { who, where, th, meta, is, how, els, w0, h0, e0, t1, t2, whoAll, one, linked, type };
  }
  const plan = () => planOf(S);

  function sheetText() {
    const p = plan();
    return [
      `[사업 기획안] ${p.t1} ${p.t2}`, p.one, "",
      `어디에: ${p.where.name}`, `누구를: ${p.whoAll}`, `무엇을: ${p.th.id ? `${p.th.name} / ` : ""}${p.is.name}`, `어떻게: ${p.how.map((x) => x.name).join(", ")}`, "",
      `사업 배경: ${p.is.a}. ${p.is.b}. ${p.where.issue} ${p.w0.need}`, "",
      `디자인 목표: ${p.w0.goal} / ${p.th.desc} / ${p.h0.goal}`, "",
      `공간 구성(AI 제안): ${p.els.map((e) => `${e.name}(${e.desc})`).join(", ")}`, "",
      `기대 효과: ${p.whoAll}의 ${p.where.short} 이용 불편 감소 / ${p.is.name} 과제의 시범 사례 / 팔레트 구독제로 군구 확산`, "",
      `연계 사업(인천 창의디자인 팔레트): ${p.linked.map((x) => x[2]).join(" / ")}`,
      p.type ? `관련 부서: ${p.type[2]}` : "",
      "", "공공디자인 AI 툴킷 for 인천에서 만든 시연용 기획안입니다.",
    ].join("\n");
  }

  // 이미지 프롬프트의 색 문구: 대상지 맥락(where.color)을 바탕으로 전략(how.color)과 대상의 필요를 더한다
  function colorOf(p) {
    const base = p.where.color || `${p.where.name} 주변 건물과 가로의 재료색에 어울리는 색`;
    const add = p.how.map((h) => h.color).filter(Boolean);
    const ids = p.who.map((w) => w.id);
    if (["elder", "blind", "wheel"].some((x) => ids.includes(x)) && !p.how.some((h) => h.id === "ud")) add.push("고령자와 저시력자도 알아보게 바닥과 시설물의 명도 대비를 크게");
    if (["child", "pupil"].some((x) => ids.includes(x)) && !p.how.some((h) => h.id === "play")) add.push("어린이 눈높이의 요소에 밝은 포인트 색");
    return `${base}을 바탕으로${add.length ? `. ${add.join(", ")}` : ""}. 시설물을 한 가지 색으로 통일하지 않음`;
  }

  function prompts(p) {
    const img = `인천 ${p.where.name}에 조성하는 공공디자인 사업의 완성 투시도를 그려 주세요.
- 사업명: ${p.t1} ${p.t2}
- 이용자: ${j(p.whoAll, "이", "가")} 실제로 공간을 쓰는 모습
- 공간 구성: ${p.els.map((e) => e.name).join(", ")}
- 디자인 전략: ${p.how.map((h) => h.name).join(", ")}
- 분위기: 한국 도시의 실제 가로 맥락, 낮 시간, 사실적인 건축 렌더링, 사람 눈높이, 16:9
- 색: ${colorOf(p)}
- 간판과 광고물은 넣지 않음`;
    const doc = `다음 조건으로 인천광역시 공공디자인 사업 기획안을 A4 두 쪽 분량으로 다듬어 주세요. 개조식으로, 사업명, 추진 배경, 대상과 대상지, 디자인 목표, 디자인 전략, 공간 구성, 추진 방식(기획 조사, 설계 제작, 사회실험과 운영), 기대 효과, 관련 부서 순서로 써 주세요. 근거가 없는 수치는 만들지 마세요.
- 사업명(초안): ${p.t1} ${p.t2}
- 어디에: ${p.where.name} / ${p.where.issue}
- 누구를: ${p.whoAll} / ${p.w0.need}
- 무엇을: ${p.th.id ? `${p.th.name} 주제, ` : ""}${p.is.name} 이슈 / ${p.is.a}. ${p.is.b}.
- 어떻게: ${p.how.map((h) => `${h.name}(${h.desc})`).join(", ")}
- 공간 구성(초안, 대상지에 맞게 바꿔도 됨): ${p.els.map((e) => `${e.name}(${e.desc})`).join(", ")}
- 연계 사업: ${p.linked.map((x) => x[2]).join(", ")}
- 관련 부서: ${p.type ? p.type[2] : "도시디자인과"}`;
    return { img, doc };
  }

  function resultScreen(skipGen) {
    if (!STEPS.every((s) => ready[s.id]())) { const miss = STEPS.find((s) => !ready[s.id]()); location.hash = `#/${miss.id}`; return ""; }
    if (!skipGen) {
      setTimeout(() => { if (location.hash.startsWith("#/result")) { app.innerHTML = resultScreen(true); app.querySelector(".result").scrollTop = 0; } }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1500);
      return `<section class="screen">${progress("result")}<div class="gen"><div class="rings"><i></i><i></i><i></i><i></i><i></i></div><p>AI가 고른 재료로 사업 기획안을 만들고 있습니다</p><small>어디에, 누구를, 무엇을, 어떻게를 하나로 엮고 공간 구성을 제안하는 중</small></div></section>`;
    }
    const p = plan(), pr = prompts(p);
    const dots = [
      ["어디에", p.where.name, pic(p.where)],
      ["누구를", p.whoAll, pic(p.w0)],
      ["무엇을", p.is.name, pic(p.meta)],
      ["어떻게", p.how.map((h) => h.name).join(", "), pic(p.h0)],
    ];
    return `<section class="screen">${progress("result")}
      <div class="result"><article class="sheet">
        <div class="r-head">
          <div>
            <p class="kicker">사업 기획안 / Project Brief</p>
            <p class="r-title"><span>${esc(p.t1)}</span><span>${esc(p.t2)}</span></p>
            <p class="r-one">${esc(p.one)}</p>
          </div>
          <div class="r-acts">
            <button class="btn fill" data-act="print">PDF로 저장, 인쇄</button>
            <button class="btn" data-act="share">이 기획안 주소 복사</button>
            <button class="btn" data-act="copy">글만 복사</button>
            <button class="btn ghost" data-act="reset">처음부터 다시</button>
          </div>
        </div>
        <div class="r-dots">${dots.map(([k, n, img]) => `<div class="opt"><span class="k">${k}</span><span class="dot">${img}</span><span class="nm">${esc(n)}</span></div>`).join("")}</div>
        <div class="r-grid">
          <div class="r-sec"><h3>사업 배경</h3><h4>${esc(p.is.name)}</h4>
            <p>${esc(p.is.a)}. ${esc(p.is.b)}.</p><p>${esc(p.where.issue)} ${esc(p.w0.need)}</p></div>
          <div class="r-sec"><h3>디자인 목표</h3><h4>${esc(p.th.slogan)}</h4>
            <ul class="sq"><li>${esc(p.w0.goal)}</li><li>${esc(p.th.desc)}</li>${p.how.map((h) => `<li>${esc(h.goal)}</li>`).join("")}</ul></div>
          <div class="r-sec wide"><h3>공간 구성 / AI 제안</h3><h4>${esc(p.e0.phrase)} ${esc(j(p.where.short, "을", "를"))} 이루는 ${p.els.length}가지 요소</h4>
            <div class="els">${p.els.map((e) => `<div class="el"><span class="ic">${svg(e.icon)}</span><div><b>${esc(e.name)}</b><span>${esc(e.desc)}</span></div></div>`).join("")}</div>
            <p class="els-n">앞에서 고른 대상, 장소, 과제, 전략으로 AI가 제안한 구성입니다. 워크숍에서 더하고 빼며 다듬어 보세요.</p></div>
          <div class="r-sec"><h3>디자인 전략</h3><h4>${esc(p.how.map((h) => h.name).join(" + "))}</h4>
            ${p.how.map((h) => `<p><b style="color:var(--ink)">${esc(h.name)}</b> / ${esc(h.desc)}</p>`).join("")}
            ${p.who.length > 1 ? `<p>${esc(p.who.slice(1).map((x) => x.name).join(", "))}의 이용도 함께 고려해, 한 대상만을 위한 시설이 아니라 여러 사람이 나눠 쓰는 공간으로 계획합니다.</p>` : ""}</div>
          <div class="r-sec"><h3>추진 방식</h3><h4>구독제 신청에서 사회실험까지</h4>
            <div class="steps3">
              <div><span>Step 1</span><b>기획, 조사</b><p>${esc(p.where.short)} 현장 관찰과 ${esc(p.w0.name)} 인터뷰로 문제 지점을 확인합니다.</p></div>
              <div><span>Step 2</span><b>설계, 제작</b><p>${esc(p.e0.name)} 등 요소를 모듈로 설계해 시제품을 만듭니다.</p></div>
              <div><span>Step 3</span><b>사회실험, 운영</b><p>팔레트 구독제로 군구가 신청하고, 사회실험 뒤 효과를 측정해 확산합니다.</p></div>
            </div></div>
          <div class="r-sec"><h3>기대 효과</h3><h4>사람, 공간, 인천</h4>
            <ul class="sq"><li><b>사람</b> ${esc(p.whoAll)}의 ${esc(p.where.short)} 이용 불편이 줄고 머무는 시간이 늘어납니다.</li>
            <li><b>공간</b> ${esc(p.where.short)}의 ‘${esc(p.is.name)}’ 과제를 디자인으로 푼 시범 사례가 됩니다.</li>
            <li><b>인천</b> 팔레트 구독제로 다른 군구의 같은 유형 ${esc(p.where.short)}에 확산할 수 있습니다.</li></ul></div>
          <div class="r-sec"><h3>인천 창의디자인 팔레트 연계 사업</h3>
            <ul class="sq">${p.linked.map((x) => `<li><b>사업 ${x[0]}</b> ${esc(x[2])}</li>`).join("")}</ul></div>
          <div class="r-sec"><h3>함께 일할 부서</h3><h4>${esc(p.type ? p.type[0] : "도시디자인")} 유형</h4>
            <p>${p.type ? `${esc(p.type[2])}, ` : ""}도시계획국(도시디자인과)</p></div>
          <div class="r-sec wide"><h3>워크숍 토론 질문</h3>
            <ul class="sq"><li>${esc(p.w0.name)}의 하루에서 ${esc(j(p.where.short, "을", "를"))} 지나는 순간은 언제입니까?</li>
            <li>${esc(j(p.e0.name, "을", "를"))} 두면 ${esc(p.who.length > 1 ? p.who[1].name : "다른 이용자")}에게는 어떤 불편이 생길 수 있습니까?</li>
            <li>사회실험이 끝난 뒤 무엇이 달라졌는지 무엇으로 확인하겠습니까?</li></ul></div>
          <div class="conc"><p>${esc(j(p.w0.name, "이", "가"))} ${esc(p.where.short)}에서 ${esc(p.e0.phrase)} 일상을 누리는 인천</p></div>
          <div class="r-sec"><h3>AI 이미지 프롬프트</h3><h4>투시도를 그려 보세요</h4><div class="prompt" id="p1">${esc(pr.img)}</div>
            <div class="p-acts"><button class="link" data-act="p1">프롬프트 복사</button></div></div>
          <div class="r-sec"><h3>AI 기획안 프롬프트</h3><h4>기획안을 더 다듬어 보세요</h4><div class="prompt" id="p2">${esc(pr.doc)}</div>
            <div class="p-acts"><button class="link" data-act="p2">프롬프트 복사</button></div></div>
        </div>
      </article></div></section>`;
  }

  // ---------- 소개, 사례, 참고 자료 ----------
  function intro() {
    const loop = [
      ["어디에", photo("frontyard")], ["누구를", photo("elder")], ["무엇을", photo("t-safety")],
      ["어떻게", photo("nudge")], ["기획안", null, "doc"],
    ];
    const last = loop.length - 1;
    return `<section class="screen"><div class="intro">
      <div>
        <p class="kicker">Public Design AI Toolkit for Incheon</p>
        <h1>공공디자인<br>AI 툴킷 <span>for 인천</span></h1>
        <p class="lead">인천 시민 디자인 워크숍을 위한 협력 툴킷입니다. 키오스크에서 메뉴를 고르듯 어디에, 누구를 위해, 무엇을, 어떻게를 차례로 고르면, AI 도우미가 단계마다 선택지를 넓혀 주고 마지막에 하나의 사업 기획안으로 엮어 줍니다. 목록에 없는 것은 단계마다 기타 칸에 직접 적을 수 있습니다.</p>
        <div class="acts"><a class="btn fill" href="#/where">툴킷 시작하기 ›</a><a class="link" href="#/cases">사례로 먼저 보기</a></div>
        <p class="note">인천광역시 공공디자인 진흥계획 6개 주제, 공공팔레트 모델의 Where, Who, What, How 구조를 바탕으로 시연용 1차 판이며, AI 추천은 규칙 기반 시연입니다.</p>
      </div>
      <div class="loop">${loop.map(([n, img, ic], i) => `<div class="opt ${i === last ? "last" : ""}"><span class="dot">${img ? `<img src="${img}" alt="">` : svg(ic)}</span><span class="nm">${i < last ? `Step ${i + 1} ` : ""}${n}</span></div>`).join("")}</div>
      <div class="how-to">
        <div><span>워크숍 1</span><b>모둠마다 한 화면</b><p>모둠이 화면 하나를 함께 보며 단계마다 토론하고 고릅니다.</p></div>
        <div><span>워크숍 2</span><b>AI로 선택지 넓히기</b><p>AI 도우미가 함께 생각할 대상, 공간, 전략을 더 보여 줍니다.</p></div>
        <div><span>워크숍 3</span><b>기획안 발표</b><p>완성된 기획안을 PDF로 저장하거나 주소로 나눠 발표합니다.</p></div>
        <div><span>워크숍 4</span><b>팔레트로 연결</b><p>좋은 기획안은 인천 창의디자인 팔레트의 실행사업 후보가 됩니다.</p></div>
      </div>
    </div></section>`;
  }

  function cases() {
    return `<section class="screen"><div class="page"><div class="page-in">
      <p class="kicker">Sample Briefs</p><h2>이렇게 조합하면 이런 기획안이 나옵니다</h2>
      <p class="lead">미리 만들어 둔 조합입니다. 누르면 해당 기획안이 열리고, 단계로 돌아가 바꿔 볼 수 있습니다.</p>
      <div class="cases">${T.cases.map((c, i) => {
        const p = planOf(fill(c.s));
        return `<button class="case" data-act="case" data-i="${i}"><span class="stack"><img src="${photo(p.where.photo)}" alt=""><img src="${photo(p.w0.photo)}" alt=""><img src="${photo(p.h0.photo)}" alt=""></span>
          <span><b>${esc(`${p.t1} ${p.t2}`)}</b><span>${esc(c.note)}</span></span></button>`;
      }).join("")}</div>
    </div></div></section>`;
  }

  function refs() {
    const label = (id) => (WHO[id] || WHERE[id] || HOW[id] || {}).name || (Object.entries(T.themeMeta).find(([, m]) => m.photo === id)?.[1].kw ? `${Object.entries(T.themeMeta).find(([, m]) => m.photo === id)[1].kw} 주제` : id);
    return `<section class="screen"><div class="page refs"><div class="page-in">
      <p class="kicker">References</p><h2>참고 자료</h2>
      <p class="lead">툴킷의 선택지와 기획안 문구가 기대는 자료와 사이트에 쓴 사진의 출처입니다. 사진은 자유 이용 라이선스(CC0, 퍼블릭 도메인, CC BY, CC BY-SA)만 골랐습니다.</p>
      <h3>자료</h3>
      <ul class="docs">${T.docs.map((d) => `<li><b>${esc(d[0])}</b><span>${esc(d[1])}</span></li>`).join("")}</ul>
      <h3>사진 출처 (${CR.length}장)</h3>
      <table class="cred"><thead><tr><th></th><th>쓰인 곳</th><th>원본 이름</th><th>저작자</th><th>라이선스</th></tr></thead><tbody>
      ${CR.map((c) => `<tr><td><img src="${c.file}" alt="" loading="lazy"></td><td class="nw">${esc(label(c.id))}</td><td>${c.page ? `<a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title)}</td><td>${esc(c.artist)}</td><td class="nw">${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license)}</td></tr>`).join("")}
      </tbody></table>
    </div></div></section>`;
  }

  // ---------- 라우팅 ----------
  function render() {
    const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
    const r = path || "intro";
    if (qs && r === "result") { S = decode(qs); save(); history.replaceState(null, "", "#/result"); }
    setMenu(STEPS.some((s) => s.id === r) || r === "result" ? "kit" : r);
    let html = "";
    if (r === "intro") html = intro();
    else if (r === "cases") html = cases();
    else if (r === "refs") html = refs();
    else if (r === "result") html = resultScreen(false);
    else if (STEPS.some((s) => s.id === r)) {
      if (!canEnter(r)) { location.hash = `#/${STEPS.find((s) => !ready[s.id]()).id}`; return; }
      html = stepScreen(r);
    } else html = intro();
    if (html) app.innerHTML = html;
  }
  let lastRoute = "";
  window.addEventListener("hashchange", () => { const r = location.hash.split("?")[0]; const same = r === lastRoute; lastRoute = r; render(); if (!same) window.scrollTo(0, 0); });
  // 같은 화면 안에서 고를 때는 선택지 목록의 스크롤 위치를 지킨다
  const _render = render;
  render = function () {
    const o = app.querySelector(".opts"), y = o ? o.scrollTop : 0, wy = window.scrollY;
    _render();
    const n = app.querySelector(".opts"); if (n) n.scrollTop = y;
    if (matchMedia("(max-width:980px)").matches) window.scrollTo(0, wy);
  };
  lastRoute = location.hash.split("?")[0];
  render();
})();
