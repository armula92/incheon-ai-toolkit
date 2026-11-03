// 공공디자인 AI 툴킷 for 인천
// 키오스크처럼 한 단계씩 고르고(누구를, 어디에, 무엇을, 어떻게, 무엇으로), 마지막에 사업 기획안을 만든다.
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
  const hasJong = (w) => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false; };
  const j = (w, a, b) => w + (hasJong(w) ? a : b); // j("고령자","을","를")
  const andList = (names) => {
    if (names.length <= 1) return names[0] || "";
    const head = names.slice(0, -1).join(", ");
    const last = names[names.length - 1];
    return (names.length > 2 ? head : names[0]) + (hasJong(names[names.length - 2]) ? "과 " : "와 ") + last;
  };

  // 상태
  const empty = () => ({ who: [], where: [], theme: [], issue: [], how: [], make: [] });
  let S = load() || empty();
  function save() { try { localStorage.setItem("ipd-toolkit", JSON.stringify(S)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem("ipd-toolkit")); } catch (e) { return null; } }
  function encode() {
    const q = new URLSearchParams();
    for (const k of Object.keys(empty())) if (S[k].length) q.set(k, S[k].join(","));
    return q.toString();
  }
  function decode(qs) {
    const q = new URLSearchParams(qs), s = empty();
    for (const k of Object.keys(s)) if (q.get(k)) s[k] = q.get(k).split(",").filter(Boolean);
    return s;
  }

  // 단계 완료 여부
  const ready = {
    who: () => S.who.length > 0,
    where: () => S.where.length > 0,
    what: () => S.theme.length > 0 && S.issue.length > 0,
    how: () => S.how.length > 0,
    make: () => S.make.length > 0,
  };
  const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);
  const canEnter = (id) => STEPS.slice(0, stepIndex(id)).every((s) => !ready[s.id] || ready[s.id]());

  // AI 추천 점수: 앞에서 고른 항목들이 가리키는 연관 목록에 몇 번 들어 있는가
  function prefs(key) {
    const out = {};
    const add = (ids, w = 1) => (ids || []).forEach((id) => (out[id] = (out[id] || 0) + w));
    S.who.forEach((id, i) => add(WHO[id] && WHO[id][key], i === 0 ? 2 : 1));
    S.where.forEach((id) => add(WHERE[id] && WHERE[id][key], 2));
    S.theme.forEach((id) => add(T.themeMeta[id] && T.themeMeta[id][key], 1.5));
    S.how.forEach((id) => add(HOW[id] && HOW[id][key], 2));
    return out;
  }
  function recommend(key, pool, n = 3, exclude = []) {
    const sc = prefs(key);
    return pool.map((o) => o.id).filter((id) => sc[id] && !exclude.includes(id))
      .sort((a, b) => sc[b] - sc[a]).slice(0, n);
  }
  const names = (ids, M) => ids.map((id) => M[id] && M[id].name).filter(Boolean);

  // 아이콘
  const ICON = T.icons;
  const svg = (k) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">${ICON[k] || ICON.dot}</svg>`;
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
    S.who.forEach((id) => WHO[id] && it.push({ k: "누구를", n: WHO[id].name, img: photo(WHO[id].photo) }));
    S.where.forEach((id) => WHERE[id] && it.push({ k: "어디에", n: WHERE[id].name, img: photo(WHERE[id].photo) }));
    S.theme.forEach((id) => TH[id] && it.push({ k: "무엇을", n: S.issue[0] ? issueOf(S.issue[0]).name : TH[id].name, img: photo(T.themeMeta[id].photo) }));
    S.how.forEach((id) => HOW[id] && it.push({ k: "어떻게", n: HOW[id].name, img: photo(HOW[id].photo) }));
    S.make.forEach((id) => EL[id] && it.push({ k: "무엇으로", n: EL[id].name, icon: EL[id].icon }));
    return it;
  }
  function bar(cur) {
    const it = trayItems();
    const i = stepIndex(cur);
    const prev = i <= 0 ? "#/intro" : `#/${STEPS[i - 1].id}`;
    const nextId = i === STEPS.length - 1 ? "result" : STEPS[i + 1].id;
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

  function issueOf(key) { const [t, n] = key.split(":"); const th = TH[t]; const is = th.issues[+n]; return { theme: th, name: is[0], a: is[1], b: is[2] }; }

  // ---------- 단계 화면 ----------
  function stepScreen(id) {
    const st = STEPS[stepIndex(id)];
    let opts = "", aiMsg = "", aiBtn = "";
    if (id === "who") {
      const amp = [];
      S.who.forEach((w) => (WHO[w].amp || []).forEach((a) => !S.who.includes(a) && !amp.includes(a) && amp.push(a)));
      const recs = amp.slice(0, 3);
      opts = T.who.map((o) => optBtn(o, "who", `<img src="${photo(o.photo)}" alt="" loading="lazy">`, S.who, recs)).join("");
      if (!S.who.length) aiMsg = `한 사람만 떠올리면 기획이 좁아집니다. <b>주 대상</b>을 먼저 고르고, 같은 공간을 함께 쓰는 사람을 <b>두 명까지</b> 더해 보세요.`;
      else {
        const m = WHO[S.who[0]];
        aiMsg = `<b>${esc(m.name)}</b>: ${esc(m.need)}`;
        if (recs.length && S.who.length < st.max) { aiMsg += `<br><span class="think">같은 공간을 함께 쓰는 <b>${esc(andList(names(recs, WHO)))}</b>도 함께 생각해 보면 어떨까요?</span>`; aiBtn = `<button class="btn" data-ai="who">AI 추천 대상 더하기</button>`; }
      }
    }
    if (id === "where") {
      const recs = recommend("where", T.where);
      opts = T.where.map((o) => optBtn(o, "where", `<img src="${photo(o.photo)}" alt="" loading="lazy">`, S.where, recs)).join("");
      if (!S.where.length) aiMsg = `<b>${esc(andList(names(S.who, WHO)))}</b>${hasJong(names(S.who, WHO).slice(-1)[0]) ? "이" : "가"} 자주 머무는 곳으로 <b>${esc(andList(names(recs, WHERE)))}</b>${hasJong(names(recs, WHERE).slice(-1)[0] || "") ? "을" : "를"} 추천합니다. 공공공간을 넓게 보고 골라 보세요.`;
      else { const w = WHERE[S.where[0]]; aiMsg = `<b>${esc(w.name)}</b>: ${esc(w.issue)}`; }
      if (!S.where.length && recs.length) aiBtn = `<button class="btn" data-ai="where">AI 추천으로 고르기</button>`;
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
      if (!S.theme.length) aiMsg = `인천 공공디자인 진흥계획은 6개 주제와 30개 이슈를 정리했습니다. 지금 조합에는 <b>${esc(andList(names(recs, TH)))}</b> 주제가 잘 맞습니다.`;
      else if (!S.issue.length) aiMsg = `<b>${esc(TH[S.theme[0]].slogan)}</b>. 아래 다섯 이슈 가운데 우리 대상지에 가장 가까운 것을 고르세요.`;
      else { const is = issueOf(S.issue[0]); aiMsg = `<b>${esc(is.name)}</b>: ${esc(is.a)}. ${esc(is.b)}.<br><span class="think">인천 공공디자인 진흥계획 중간보고의 근거입니다.</span>`; }
      if (!S.issue.length) aiBtn = `<button class="btn" data-ai="what">AI 추천으로 고르기</button>`;
    }
    if (id === "how") {
      const recs = recommend("how", T.how);
      opts = T.how.map((o) => optBtn(o, "how", `<img src="${photo(o.photo)}" alt="" loading="lazy">`, S.how, recs)).join("");
      if (!S.how.length) aiMsg = `디자인 전략은 공간이 사람의 행동을 어떻게 바꿀지 정하는 방법입니다. 이 조합에는 <b>${esc(andList(names(recs, HOW)))}</b> 전략을 추천합니다. 두 개까지 섞을 수 있습니다.`;
      else { const h = HOW[S.how[0]]; aiMsg = `<b>${esc(h.name)}</b>: ${esc(h.desc)}`; if (S.how[1]) aiMsg += `<br><span class="think">${esc(HOW[S.how[1]].name)} 전략을 더해 ${esc(HOW[S.how[1]].goal)}.</span>`; }
      if (!S.how.length) aiBtn = `<button class="btn" data-ai="how">AI 추천으로 고르기</button>`;
    }
    if (id === "make") {
      const recs = recommend("el", T.elements, 4);
      opts = T.elements.map((o) => optBtn(o, "make", svg(o.icon), S.make, recs)).join("");
      const left = recs.filter((r) => !S.make.includes(r));
      if (!S.make.length) aiMsg = `햄버거에 재료를 담듯 공간을 이룰 요소를 고릅니다. 지금까지의 선택으로 보면 <b>${esc(andList(names(recs, EL)))}</b>${hasJong(names(recs, EL).slice(-1)[0] || "") ? "이" : "가"} 필요해 보입니다.`;
      else aiMsg = `<b>${esc(andList(names(S.make, EL)))}</b>${hasJong(names(S.make, EL).slice(-1)[0]) ? "을" : "를"} 담았습니다. ${left.length ? `<span class="think">${esc(andList(names(left, EL)))}${hasJong(names(left, EL).slice(-1)[0]) ? "도" : "도"} 함께 생각해 보세요.</span>` : `<span class="think">기획안을 만들 준비가 되었습니다.</span>`}`;
      if (left.length && S.make.length < st.max) aiBtn = `<button class="btn" data-ai="make">AI 추천 구성 담기</button>`;
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
    const words = [...S.where.map((id) => WHERE[id].kw || []), ...S.who.map((id) => WHO[id].kw || [])].flat();
    let best = 0, bs = -1;
    th.issues.forEach((is, n) => { const t = is.join(" "); const s = words.filter((w) => t.includes(w)).length; if (s > bs) { bs = s; best = n; } });
    return best;
  }

  // 선택 처리
  app.addEventListener("click", (e) => {
    const o = e.target.closest("[data-k]");
    if (o) {
      const k = o.dataset.k, id = o.dataset.id;
      const max = { who: 3, where: 1, theme: 1, issue: 1, how: 2, make: 5 }[k];
      const arr = S[k];
      const at = arr.indexOf(id);
      if (at >= 0) arr.splice(at, 1);
      else if (max === 1) arr.splice(0, arr.length, id);
      else if (arr.length < max) arr.push(id);
      else { toast(`최대 ${max}개까지 고를 수 있습니다`); return; }
      if (k === "theme") S.issue = [];
      save(); render();
      return;
    }
    const ai = e.target.closest("[data-ai]");
    if (ai) {
      const k = ai.dataset.ai;
      if (k === "who") { const amp = []; S.who.forEach((w) => (WHO[w].amp || []).forEach((a) => !S.who.includes(a) && !amp.includes(a) && amp.push(a))); S.who.push(...amp.slice(0, 3 - S.who.length)); }
      if (k === "where") S.where = recommend("where", T.where, 1);
      if (k === "what") { if (!S.theme.length) S.theme = recommend("themes", P.themes, 1); if (!S.theme.length) S.theme = [P.themes[0].id]; S.issue = [`${S.theme[0]}:${recommendIssue(TH[S.theme[0]])}`]; }
      if (k === "how") S.how = recommend("how", T.how, 1);
      if (k === "make") { const r = recommend("el", T.elements, 4).filter((x) => !S.make.includes(x)); S.make.push(...r.slice(0, 5 - S.make.length)); }
      save(); render();
      return;
    }
    const act = e.target.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "reset") { S = empty(); save(); location.hash = "#/who"; }
      if (a === "print") window.print();
      if (a === "copy") copy(sheetText(), "기획안 글을 복사했습니다");
      if (a === "share") copy(location.href.split("#")[0] + "#/result?" + encode(), "이 기획안 주소를 복사했습니다");
      if (a === "p1") copy(document.getElementById("p1").textContent, "이미지 프롬프트를 복사했습니다");
      if (a === "p2") copy(document.getElementById("p2").textContent, "기획안 프롬프트를 복사했습니다");
      if (a === "case") { S = JSON.parse(JSON.stringify(T.cases[+act.dataset.i].s)); save(); location.hash = "#/result"; }
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
  function plan() {
    const who = S.who.map((id) => WHO[id]), where = WHERE[S.where[0]], th = TH[S.theme[0]], meta = T.themeMeta[S.theme[0]];
    const is = issueOf(S.issue[0]), how = S.how.map((id) => HOW[id]), els = S.make.map((id) => EL[id]);
    const w0 = who[0], h0 = how[0], e0 = els[0];
    const t1 = `${j(w0.name, "을", "를")} 위한 ${h0.adj} ${meta.kw} ${where.short}`;
    const t2 = `${e0.phrase} ${h0.noun} 디자인`;
    const whoAll = andList(who.map((x) => x.name));
    const one = `${where.name}에서 ${j(whoAll, "이", "가")} 겪는 ‘${is.name}’ 과제를 ${andList(how.map((x) => x.name))} 전략과 ${andList(els.map((x) => x.name))}${hasJong(els[els.length - 1].name) ? "으로" : "로"} 풀어 ‘${th.slogan}’${hasJong(th.slogan) ? "을" : "를"} 만드는 사업입니다.`;
    // 인천 팔레트 연계 사업: 같은 주제 우선, 낱말 겹침으로 정렬
    const words = [where.short, ...where.kw || [], ...els.map((x) => x.name), ...how.map((x) => x.noun), ...who.flatMap((x) => x.kw || []), ...is.name.split(/[ ,()]+/).filter((x) => x.length > 1)];
    const linked = P.projects.map((p) => {
      const t = p[2] + p[4];
      return { p, s: (p[1] === th.id ? 1.5 : 0) + words.filter((wd) => wd && t.includes(wd)).length + p[0] / 1000 * -1 };
    }).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.p);
    const type = P.types.find((t) => t[0] === where.type);
    return { who, where, th, meta, is, how, els, w0, h0, e0, t1, t2, whoAll, one, linked, type };
  }

  function sheetText() {
    const p = plan();
    return [
      `[사업 기획안] ${p.t1} ${p.t2}`, p.one, "",
      `누구를: ${p.whoAll}`, `어디에: ${p.where.name}`, `무엇을: ${p.th.name} / ${p.is.name}`, `어떻게: ${p.how.map((x) => x.name).join(", ")}`, `무엇으로: ${p.els.map((x) => x.name).join(", ")}`, "",
      `사업 배경: ${p.is.a}. ${p.is.b}. ${p.where.issue} ${p.w0.need}`, "",
      `디자인 목표: ${p.w0.goal} / ${p.th.desc} / ${p.h0.goal}`, "",
      `공간 구성: ${p.els.map((e) => `${e.name}(${e.desc})`).join(", ")}`, "",
      `기대 효과: ${p.whoAll}의 ${p.where.short} 이용 불편 감소 / ${p.is.name} 과제의 시범 사례 / 팔레트 구독제로 군구 확산`, "",
      `연계 사업(인천 창의디자인 팔레트): ${p.linked.map((x) => x[2]).join(" / ")}`,
      p.type ? `관련 부서: ${p.type[2]}` : "",
      "", "공공디자인 AI 툴킷 for 인천에서 만든 시연용 기획안입니다.",
    ].join("\n");
  }

  function prompts(p) {
    const img = `인천 ${p.where.name}에 조성하는 공공디자인 사업의 완성 투시도를 그려 주세요.
- 사업명: ${p.t1} ${p.t2}
- 이용자: ${p.whoAll}가 실제로 공간을 쓰는 모습
- 공간 구성: ${p.els.map((e) => e.name).join(", ")}
- 디자인 전략: ${p.how.map((h) => h.name).join(", ")}
- 분위기: 한국 도시의 실제 가로 맥락, 낮 시간, 사실적인 건축 렌더링, 사람 눈높이, 16:9
- 색: 차분한 회색과 남색 계열, 간판과 광고물은 넣지 않음`;
    const doc = `다음 조건으로 인천광역시 공공디자인 사업 기획안을 A4 두 쪽 분량으로 다듬어 주세요. 개조식으로, 사업명, 추진 배경, 대상과 대상지, 디자인 목표, 디자인 전략, 공간 구성, 추진 방식(기획 조사, 설계 제작, 사회실험과 운영), 기대 효과, 관련 부서 순서로 써 주세요. 근거가 없는 수치는 만들지 마세요.
- 사업명(초안): ${p.t1} ${p.t2}
- 누구를: ${p.whoAll} / ${p.w0.need}
- 어디에: ${p.where.name} / ${p.where.issue}
- 무엇을: ${p.th.name} 주제, ${p.is.name} 이슈 / ${p.is.a}. ${p.is.b}.
- 어떻게: ${p.how.map((h) => `${h.name}(${h.desc})`).join(", ")}
- 무엇으로: ${p.els.map((e) => `${e.name}(${e.desc})`).join(", ")}
- 연계 사업: ${p.linked.map((x) => x[2]).join(", ")}
- 관련 부서: ${p.type ? p.type[2] : "도시디자인과"}`;
    return { img, doc };
  }

  function resultScreen(skipGen) {
    if (!STEPS.every((s) => ready[s.id]())) { const miss = STEPS.find((s) => !ready[s.id]()); location.hash = `#/${miss.id}`; return ""; }
    if (!skipGen) {
      setTimeout(() => { if (location.hash.startsWith("#/result")) { app.innerHTML = resultScreen(true); app.querySelector(".result").scrollTop = 0; } }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1500);
      return `<section class="screen">${progress("result")}<div class="gen"><div class="rings"><i></i><i></i><i></i><i></i><i></i></div><p>AI가 고른 재료로 사업 기획안을 만들고 있습니다</p><small>누구를, 어디에, 무엇을, 어떻게, 무엇으로를 하나로 엮는 중</small></div></section>`;
    }
    const p = plan(), pr = prompts(p);
    const dots = [
      ["누구를", p.whoAll, `<img src="${photo(p.w0.photo)}" alt="">`],
      ["어디에", p.where.name, `<img src="${photo(p.where.photo)}" alt="">`],
      ["무엇을", p.is.name, `<img src="${photo(p.meta.photo)}" alt="">`],
      ["어떻게", p.how.map((h) => h.name).join(", "), `<img src="${photo(p.h0.photo)}" alt="">`],
      ["무엇으로", p.els.map((e) => e.name).join(", "), svg(p.e0.icon)],
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
          <div class="r-sec wide"><h3>공간 구성</h3><h4>${esc(p.e0.phrase)} ${esc(p.where.short)}을 이루는 ${p.els.length}가지 요소</h4>
            <div class="els">${p.els.map((e) => `<div class="el"><span class="ic">${svg(e.icon)}</span><div><b>${esc(e.name)}</b><span>${esc(e.desc)}</span></div></div>`).join("")}</div></div>
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
            <p>${esc(p.type ? p.type[2] : "")}, 도시계획국(도시디자인과)</p></div>
          <div class="r-sec wide"><h3>워크숍 토론 질문</h3>
            <ul class="sq"><li>${esc(p.w0.name)}의 하루에서 ${esc(p.where.short)}을 지나는 순간은 언제입니까?</li>
            <li>${esc(p.e0.name)}을 두면 ${esc(p.who.length > 1 ? p.who[1].name : "다른 이용자")}에게는 어떤 불편이 생길 수 있습니까?</li>
            <li>사회실험이 끝난 뒤 무엇이 달라졌는지 무엇으로 확인하겠습니까?</li></ul></div>
          <div class="conc"><span class="b"></span><p>${esc(j(p.w0.name, "이", "가"))} ${esc(p.where.short)}에서 ${esc(p.e0.phrase)} 일상을 누리는 인천</p></div>
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
      ["누구를", photo("elder")], ["어디에", photo("frontyard")], ["무엇을", photo("t-safety")],
      ["어떻게", photo("nudge")], ["무엇으로", null, "bench"], ["기획안", null, "doc"],
    ];
    return `<section class="screen"><div class="intro">
      <div>
        <p class="kicker">Public Design AI Toolkit for Incheon</p>
        <h1>공공디자인<br>AI 툴킷 <span>for 인천</span></h1>
        <p class="lead">인천 시민 디자인 워크숍을 위한 협력 툴킷입니다. 키오스크에서 메뉴를 고르듯 누구를 위해, 어디에, 무엇을, 어떻게를 차례로 고르면, AI 도우미가 단계마다 선택지를 넓혀 주고 마지막에 하나의 사업 기획안으로 엮어 줍니다.</p>
        <div class="acts"><a class="btn fill" href="#/who">툴킷 시작하기 ›</a><a class="link" href="#/cases">사례로 먼저 보기</a></div>
        <p class="note">선택지는 인천광역시 공공디자인 진흥계획(중간보고)의 6개 주제, 30개 이슈와 충남 공공팔레트 모델의 Where, Who, What, How 구조를 바탕으로 했습니다. 이 사이트는 시연용 1차 판이며, AI 추천은 규칙 기반 시연입니다.</p>
      </div>
      <div class="loop">${loop.map(([n, img, ic], i) => `<div class="opt ${i === 5 ? "last" : ""}"><span class="dot">${img ? `<img src="${img}" alt="">` : svg(ic)}</span><span class="nm">${i < 5 ? `Step ${i + 1} ` : ""}${n}</span></div>`).join("")}</div>
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
        const s = c.s, w = WHO[s.who[0]], wh = WHERE[s.where[0]], h = HOW[s.how[0]], e = EL[s.make[0]], m = T.themeMeta[s.theme[0]];
        const title = `${j(w.name, "을", "를")} 위한 ${h.adj} ${m.kw} ${wh.short} ${e.phrase} ${h.noun} 디자인`;
        return `<button class="case" data-act="case" data-i="${i}"><span class="stack"><img src="${photo(w.photo)}" alt=""><img src="${photo(wh.photo)}" alt=""><img src="${photo(h.photo)}" alt=""></span>
          <span><b>${esc(title)}</b><span>${esc(c.note)}</span></span></button>`;
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
