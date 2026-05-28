const WORKER_URL = "https://sales-kpi-agent.gmo-k-watanabe.workers.dev";

const INDUSTRIES = [
  "", "機械・製造","建設・不動産","小売","EC・通販","官公庁・団体",
  "飲食・宿泊","医療・介護","美容・ヘルスケア","教育・スクール",
  "人材・コンサル","士業・法律","金融・保険","物流・運輸",
  "レジャー・エンタメ","冠婚葬祭","IT・情報通信","生活サービス",
  "ペット・ホビー","広告・メディア","卸売・商社",
];

let segmentCounter = 0;
let lastDesignResult = null;

const $ = (id) => document.getElementById(id);

function industryOptions(selected = "") {
  return INDUSTRIES.map(v => {
    const label = v === "" ? "指定無し" : v;
    return `<option value="${v}" ${v === selected ? "selected" : ""}>${label}</option>`;
  }).join("");
}

function getMetricLabels() {
  const m = $("metricType").value;
  return m === "gross"
    ? { targetLabel: "粗利目標（円）", unitLabel: "平均粗利単価（円）", personLabel: "粗利目標" }
    : { targetLabel: "売上目標（円）", unitLabel: "平均顧客単価（円）", personLabel: "売上目標" };
}

// ============================================================
// 業種行追加
// ============================================================
function addSegmentRow(preset = {}) {
  segmentCounter++;
  const id = segmentCounter;
  const { targetLabel, unitLabel } = getMetricLabels();
  const row = document.createElement("div");
  row.className = "segment-row";
  row.dataset.id = id;
  row.innerHTML = `
    <label>業種
      <select class="seg-industry">${industryOptions(preset.industry || "")}</select>
    </label>
    <label><span class="seg-target-label">${targetLabel}</span>
      <input type="number" class="seg-target" placeholder="例: 10000000" step="10000" min="0" value="${preset.target || ""}" />
    </label>
    <label><span class="seg-unit-label">${unitLabel}</span>
      <input type="number" class="seg-unit" placeholder="例: 500000" step="10000" min="0" value="${preset.unit || ""}" />
    </label>
    <label>営業人数
      <input type="number" class="seg-members" placeholder="例: 2" step="1" min="1" value="${preset.members || ""}" />
    </label>
    <button type="button" class="btn-remove">削除</button>
    <div class="persons-wrap" hidden>
      <h5>👥 個人別目標
        <button type="button" class="btn-redistribute">均等再配分</button>
      </h5>
      <div class="persons-grid"></div>
      <div class="persons-summary"></div>
    </div>
  `;

  // 削除ボタン
  row.querySelector(".btn-remove").addEventListener("click", () => {
    if (document.querySelectorAll(".segment-row").length <= 1) {
      alert("最低1行は必要です");
      return;
    }
    row.remove();
  });

  // 目標金額・人数の変化で個人別欄を再構築
  const targetInput  = row.querySelector(".seg-target");
  const membersInput = row.querySelector(".seg-members");
  targetInput.addEventListener("input", () => rebuildPersons(row, true));
  membersInput.addEventListener("input", () => rebuildPersons(row, true));

  // 均等再配分ボタン
  row.querySelector(".btn-redistribute").addEventListener("click", () => rebuildPersons(row, true));

  $("segmentList").appendChild(row);
  rebuildPersons(row, true);
}

// ============================================================
// 個人別欄を再構築
//   force=true ... 等分配でリセット
//   force=false ... 既存値を温存して人数差分だけ調整
// ============================================================
function rebuildPersons(row, force = false) {
  const target  = Number(row.querySelector(".seg-target").value || 0);
  const members = Math.max(1, Number(row.querySelector(".seg-members").value || 0));
  const wrap    = row.querySelector(".persons-wrap");
  const grid    = row.querySelector(".persons-grid");
  const { personLabel } = getMetricLabels();

  if (!members || !target) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;

  // 既存値を取得
  const existing = Array.from(grid.querySelectorAll(".person-target"))
                        .map(i => Number(i.value || 0));

  // 等分配（端数は最後の人に寄せる）
  const baseShare = Math.floor(target / members / 10000) * 10000; // 1万円単位
  const distributed = Array(members).fill(baseShare);
  const used = baseShare * members;
  distributed[members - 1] += (target - used); // 残差を最後に加算

  // 値の確定（force=true なら強制等分配、false なら既存温存）
  let values;
  if (force || existing.length === 0) {
    values = distributed;
  } else {
    values = [];
    for (let i = 0; i < members; i++) {
      if (existing[i] != null && existing[i] !== 0) values.push(existing[i]);
      else values.push(distributed[i] || 0);
    }
  }

  // DOM再生成
  grid.innerHTML = values.map((v, i) => `
    <div class="person-item">
      <label>担当者${i + 1}（${personLabel}）
        <input type="number" class="person-target" data-idx="${i}"
               step="10000" min="0" value="${v}" />
      </label>
    </div>
  `).join("");

  // 入力時の合計判定
  grid.querySelectorAll(".person-target").forEach(inp => {
    inp.addEventListener("input", () => updatePersonsSummary(row));
  });

  updatePersonsSummary(row);
}

// ============================================================
// 合計判定表示
// ============================================================
function updatePersonsSummary(row) {
  const target = Number(row.querySelector(".seg-target").value || 0);
  const sum = Array.from(row.querySelectorAll(".person-target"))
                   .reduce((s, i) => s + Number(i.value || 0), 0);
  const diff = sum - target;
  const sumEl = row.querySelector(".persons-summary");
  if (diff === 0) {
    sumEl.className = "persons-summary ok";
    sumEl.innerHTML = `✅ 個人合計: <b>${sum.toLocaleString()}</b>円（業種目標と一致）`;
  } else {
    sumEl.className = "persons-summary warn";
    const sign = diff > 0 ? "超過" : "不足";
    sumEl.innerHTML = `⚠️ 個人合計: <b>${sum.toLocaleString()}</b>円 / 業種目標: <b>${target.toLocaleString()}</b>円 → <b>${Math.abs(diff).toLocaleString()}円 ${sign}</b>`;
  }
}

// ============================================================
// 指標切替で全行のラベル更新
// ============================================================
function syncAllSegmentLabels() {
  const { targetLabel, unitLabel } = getMetricLabels();
  document.querySelectorAll(".seg-target-label").forEach(e => e.textContent = targetLabel);
  document.querySelectorAll(".seg-unit-label").forEach(e => e.textContent = unitLabel);
  // 個人別欄のラベルも更新
  document.querySelectorAll(".segment-row").forEach(r => rebuildPersons(r, false));
}
$("metricType").addEventListener("change", syncAllSegmentLabels);

// ============================================================
// 初期表示・追加
// ============================================================
addSegmentRow();
$("btnAddSegment").addEventListener("click", () => addSegmentRow());

// ============================================================
// 入力収集
// ============================================================
function collectSegments() {
  const rows = document.querySelectorAll(".segment-row");
  const segments = [];
  let hasMismatch = false;

  rows.forEach((r, idx) => {
    const industry = r.querySelector(".seg-industry").value;
    const target   = Number(r.querySelector(".seg-target").value || 0);
    const unit     = Number(r.querySelector(".seg-unit").value || 0);
    const members  = Number(r.querySelector(".seg-members").value || 1);
    const persons  = Array.from(r.querySelectorAll(".person-target"))
                          .map((i, k) => ({ name: `担当者${k + 1}`, target: Number(i.value || 0) }));
    const personSum = persons.reduce((s, p) => s + p.target, 0);
    if (personSum !== target && target > 0) hasMismatch = true;

    if (target > 0 && unit > 0) {
      segments.push({ industry, target, unit, members, persons, personSum });
    }
  });

  return { segments, hasMismatch };
}

// ============================================================
// KPI設計実行
// ============================================================
$("btnDesign").addEventListener("click", async () => {
  const { segments, hasMismatch } = collectSegments();
  if (segments.length === 0) {
    alert("少なくとも1つの業種に有効な目標と単価を入力してください");
    return;
  }
  if (hasMismatch) {
    if (!confirm("個人合計と業種目標が一致していない業種があります。このまま分析を続けますか？")) return;
  }

  const payload = {
    action: "designMulti",
    purpose:    $("purpose").value,
    period:     $("period").value,
    metricType: $("metricType").value,
    segments,
  };

  const btn = $("btnDesign");
  btn.disabled = true;
  btn.textContent = "AIが分析中…(最大60秒)";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    lastDesignResult = data;
    renderResult(data);
  } catch (e) {
    alert("エラー: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "KPIを設計する";
  }
});

// ============================================================
// 結果描画
// ============================================================
function renderResult(data) {
  $("kpiSection").hidden = false;
  $("resultSection").hidden = false;

  const total = data.total || {};
  const segs  = data.segments || [];

  let html = `
    <div class="total-block">
      <h4>🏆 合計サマリー（${total.metricLabel || ""}）</h4>
      <div>${total.summary || ""}</div>
      <div style="margin-top:8px;">
        総${total.targetLabel}: <b>${(total.totalTarget||0).toLocaleString()}</b>円<br>
        総営業人数: <b>${total.totalMembers||0}</b>名<br>
        必要受注総数: <b>${total.totalNeedDeals||0}</b>件 / 1日 <b>${total.dailyDeals||0}</b>件<br>
        営業日数: 約${total.businessDays||0}日
      </div>
      <h5 style="margin-top:12px;">🎯 全体共通KPI</h5>
      ${(total.kpis||[]).map((k,i)=>`
        <div class="kpi-item">
          <b>${i+1}. ${k.name}</b>：${k.target} ${k.unit}<br>
          <small>${k.reason||""}</small>
        </div>`).join("")}
      <h5 style="margin-top:12px;">🧩 全体タスク</h5>
      <div>${(total.actions||[]).map(a=>"・"+a).join("<br>")}</div>
    </div>
  `;

  segs.forEach((s, idx) => {
    const personsHtml = (s.persons || []).map((p, i) => `
      <div class="kpi-item" style="background:#f8fafc;">
        <b>${p.name}</b>：${total.targetLabel} <b>${p.target.toLocaleString()}</b>円
        / 必要受注 <b>${p.needDeals}</b>件 / 1日 <b>${p.dailyDeals}</b>件
        ${p.comment ? `<br><small>💬 ${p.comment}</small>` : ""}
      </div>
    `).join("");

    html += `
      <div class="segment-block">
        <h4>📊 ${idx+1}. ${s.industryLabel}</h4>
        <div>${s.summary||""}</div>
        <div style="margin-top:6px;">
          ${total.targetLabel}: <b>${s.target.toLocaleString()}</b>円 /
          ${total.unitLabel}: <b>${s.unit.toLocaleString()}</b>円 /
          営業人数: <b>${s.members}</b>名<br>
          必要受注数: <b>${s.needDeals}</b>件 / 1人 <b>${s.perPerson}</b>件 / 1日 <b>${s.dailyDeals}</b>件
        </div>

        <h5 style="margin-top:10px;">👥 担当者別の割当・所感</h5>
        ${personsHtml || "<small>担当者データなし</small>"}

        <h5 style="margin-top:10px;">🎯 推奨KPI</h5>
        ${(s.kpis||[]).map((k,i)=>`
          <div class="kpi-item">
            <b>${i+1}. ${k.name}</b>：${k.target} ${k.unit}<br>
            <small>${k.reason||""}</small>
          </div>`).join("")}
        <h5 style="margin-top:10px;">🧩 日次アクション</h5>
        <div>${(s.actions||[]).map(a=>"・"+a).join("<br>")}</div>
        <h5 style="margin-top:10px;">📚 参照フレームワーク</h5>
        <div><small>${s.framework||""}</small></div>
      </div>
    `;
  });

  $("kpiOutput").innerHTML = html;

  // 実績入力欄（業種ごと）
  let resHtml = "";
  segs.forEach((s, idx) => {
    resHtml += `
      <div class="segment-block">
        <h4>📊 ${idx+1}. ${s.industryLabel} の実績入力</h4>
        <div class="grid">
          ${s.kpis.map((k, i) => `
            <label>${k.name}（${k.unit}）
              <input type="number" class="result-input"
                     data-seg="${idx}" data-idx="${i}"
                     step="${k.unit==='円'?10000:1}" min="0" />
            </label>
          `).join("")}
        </div>
      </div>
    `;
  });
  $("resultInputs").innerHTML = resHtml;
}

// ============================================================
// 実績評価
// ============================================================
$("btnEvaluate").addEventListener("click", async () => {
  if (!lastDesignResult) return;
  const segs = lastDesignResult.segments || [];
  const segmentResults = segs.map((s, sIdx) => ({
    industryLabel: s.industryLabel,
    results: s.kpis.map((k, kIdx) => ({
      name: k.name,
      target: k.target,
      unit: k.unit,
      actual: Number(
        document.querySelector(`.result-input[data-seg="${sIdx}"][data-idx="${kIdx}"]`)?.value || 0
      ),
    })),
  }));

  const btn = $("btnEvaluate");
  btn.disabled = true;
  btn.textContent = "評価中…";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "evaluateMulti", segmentResults }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    let html = `
      <div class="total-block">
        <h4>🏆 全体総括</h4>
        ${data.overall || ""}
      </div>
    `;
    (data.perSegment || []).forEach((p, i) => {
      html += `
        <div class="segment-block">
          <h4>📊 ${i+1}. ${p.industryLabel}</h4>
          <div>${p.evaluation || ""}</div>
          <h5 style="margin-top:10px;">💡 改善アクション</h5>
          <div>${(p.improvements||[]).map(s => "・"+s).join("<br>")}</div>
        </div>
      `;
    });
    $("evalOutput").innerHTML = html;
  } catch (e) {
    alert("エラー: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "実績を評価する";
  }
});
