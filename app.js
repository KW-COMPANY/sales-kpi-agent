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
const fmt = (n) => Number(n || 0).toLocaleString();

function industryOptions(selected = "") {
  return INDUSTRIES.map(v => {
    const label = v === "" ? "指定無し" : v;
    return `<option value="${v}" ${v === selected ? "selected" : ""}>${label}</option>`;
  }).join("");
}

function getMetricLabels() {
  const m = $("metricType").value;
  return m === "gross"
    ? { targetLabel: "粗利目標（円）", unitLabel: "平均粗利単価（円）", personLabel: "粗利目標", overallTargetLabel: "全体粗利目標（円）" }
    : { targetLabel: "売上目標（円）", unitLabel: "平均顧客単価（円）", personLabel: "売上目標", overallTargetLabel: "全体売上目標（円）" };
}

// ============================================================
// 全体目標の整合性チェック
// ============================================================
function updateOverallSummary() {
  const overall = Number($("overallTarget").value || 0);
  const segSum = Array.from(document.querySelectorAll(".seg-target"))
                      .reduce((s, i) => s + Number(i.value || 0), 0);
  const sumEl = $("overallSummary");
  const { targetLabel } = getMetricLabels();

  if (!overall) {
    sumEl.className = "persons-summary";
    sumEl.innerHTML = `⬆️ ${targetLabel}を入力してください`;
    return;
  }
  if (segSum === 0) {
    sumEl.className = "persons-summary warn";
    sumEl.innerHTML = `🎯 全体${targetLabel.replace("（円）","")}: <b>${fmt(overall)}</b>円 / 業種合計: <b>0</b>円 → 「✨業種に均等配分」を押すか業種ごとに入力してください`;
    return;
  }
  const diff = segSum - overall;
  if (diff === 0) {
    sumEl.className = "persons-summary ok";
    sumEl.innerHTML = `✅ 業種合計: <b>${fmt(segSum)}</b>円（全体${targetLabel.replace("（円）","")}と一致）`;
  } else {
    sumEl.className = "persons-summary warn";
    const sign = diff > 0 ? "超過" : "不足";
    sumEl.innerHTML = `⚠️ 全体${targetLabel.replace("（円）","")}: <b>${fmt(overall)}</b>円 / 業種合計: <b>${fmt(segSum)}</b>円 → <b>${fmt(Math.abs(diff))}円 ${sign}</b>`;
  }
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

  row.querySelector(".btn-remove").addEventListener("click", () => {
    if (document.querySelectorAll(".segment-row").length <= 1) {
      alert("最低1行は必要です");
      return;
    }
    row.remove();
    updateOverallSummary();
  });

  const targetInput  = row.querySelector(".seg-target");
  const membersInput = row.querySelector(".seg-members");
  targetInput.addEventListener("input", () => {
    rebuildPersons(row, true);
    updateOverallSummary();
  });
  membersInput.addEventListener("input", () => rebuildPersons(row, true));
  row.querySelector(".btn-redistribute").addEventListener("click", () => rebuildPersons(row, true));

  $("segmentList").appendChild(row);
  rebuildPersons(row, true);
  updateOverallSummary();
}

// ============================================================
// 全体目標を業種に均等配分
// ============================================================
function distributeToSegments() {
  const overall = Number($("overallTarget").value || 0);
  const rows = document.querySelectorAll(".segment-row");
  if (!overall) {
    alert("先に全体目標を入力してください");
    return;
  }
  if (rows.length === 0) {
    alert("業種行が存在しません");
    return;
  }

  const baseShare = Math.floor(overall / rows.length / 10000) * 10000;
  let used = 0;
  rows.forEach((r, idx) => {
    let share = baseShare;
    if (idx === rows.length - 1) share = overall - used; // 端数を最後に寄せる
    used += share;
    r.querySelector(".seg-target").value = share;
    rebuildPersons(r, true);
  });
  updateOverallSummary();
}

// ============================================================
// 個人別欄の再構築
// ============================================================
function rebuildPersons(row, force = false) {
  const target  = Number(row.querySelector(".seg-target").value || 0);
  const members = Math.max(1, Number(row.querySelector(".seg-members").value || 0));
  const wrap    = row.querySelector(".persons-wrap");
  const grid    = row.querySelector(".persons-grid");
  const { personLabel } = getMetricLabels();

  if (!members || !target) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const existing = Array.from(grid.querySelectorAll(".person-target")).map(i => Number(i.value || 0));

  const baseShare = Math.floor(target / members / 10000) * 10000;
  const distributed = Array(members).fill(baseShare);
  distributed[members - 1] += (target - baseShare * members);

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

  grid.innerHTML = values.map((v, i) => `
    <div class="person-item">
      <label>担当者${i + 1}（${personLabel}）
        <input type="number" class="person-target" data-idx="${i}"
               step="10000" min="0" value="${v}" />
      </label>
    </div>
  `).join("");

  grid.querySelectorAll(".person-target").forEach(inp => {
    inp.addEventListener("input", () => updatePersonsSummary(row));
  });

  updatePersonsSummary(row);
}

function updatePersonsSummary(row) {
  const target = Number(row.querySelector(".seg-target").value || 0);
  const sum = Array.from(row.querySelectorAll(".person-target"))
                   .reduce((s, i) => s + Number(i.value || 0), 0);
  const diff = sum - target;
  const sumEl = row.querySelector(".persons-summary");
  if (diff === 0) {
    sumEl.className = "persons-summary ok";
    sumEl.innerHTML = `✅ 個人合計: <b>${fmt(sum)}</b>円（業種目標と一致）`;
  } else {
    sumEl.className = "persons-summary warn";
    const sign = diff > 0 ? "超過" : "不足";
    sumEl.innerHTML = `⚠️ 個人合計: <b>${fmt(sum)}</b>円 / 業種目標: <b>${fmt(target)}</b>円 → <b>${fmt(Math.abs(diff))}円 ${sign}</b>`;
  }
}

// ============================================================
// 指標切替時の処理
// ============================================================
function syncAllLabels() {
  const { targetLabel, unitLabel, overallTargetLabel } = getMetricLabels();
  $("overallTargetLabel").textContent = overallTargetLabel;
  document.querySelectorAll(".seg-target-label").forEach(e => e.textContent = targetLabel);
  document.querySelectorAll(".seg-unit-label").forEach(e => e.textContent = unitLabel);
  document.querySelectorAll(".segment-row").forEach(r => rebuildPersons(r, false));
  updateOverallSummary();
}
$("metricType").addEventListener("change", syncAllLabels);

// ============================================================
// 初期化＆イベントバインド
// ============================================================
addSegmentRow();
$("btnAddSegment").addEventListener("click", () => addSegmentRow());
$("btnDistribute").addEventListener("click", distributeToSegments);
$("overallTarget").addEventListener("input", updateOverallSummary);

// ============================================================
// 入力収集
// ============================================================
function collectSegments() {
  const rows = document.querySelectorAll(".segment-row");
  const segments = [];
  let hasMismatch = false;

  rows.forEach((r) => {
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
  const overallTarget = Number($("overallTarget").value || 0);
  if (!overallTarget) {
    alert("全体目標を入力してください");
    return;
  }

  const { segments, hasMismatch } = collectSegments();
  if (segments.length === 0) {
    alert("少なくとも1つの業種に有効な目標と単価を入力してください");
    return;
  }

  const segSum = segments.reduce((s, x) => s + x.target, 0);
  if (segSum !== overallTarget) {
    if (!confirm(`業種合計(${fmt(segSum)}円)が全体目標(${fmt(overallTarget)}円)と一致していません。続行しますか？`)) return;
  }
  if (hasMismatch) {
    if (!confirm("個人合計と業種目標が一致していない業種があります。続行しますか？")) return;
  }

  const payload = {
    action: "designMulti",
    purpose:    $("purpose").value,
    period:     $("period").value,
    metricType: $("metricType").value,
    overallTarget,
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
    console.log("[Design Response]", data);
    if (data.error) throw new Error(data.error);
    lastDesignResult = data;
    renderResult(data);
  } catch (e) {
    console.error(e);
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
  const segs  = Array.isArray(data.segments) ? data.segments : [];
  const targetLabel = total.targetLabel || "目標";
  const unitLabel   = total.unitLabel   || "単価";

  const matchBadge = total.overallTarget === total.totalTarget
    ? `<span style="color:#047857;">✅ 全体目標と一致</span>`
    : `<span style="color:#b45309;">⚠️ 全体目標と差異あり</span>`;

  let html = `
    <div class="total-block">
      <h4>🏆 合計サマリー（全業種合算 / ${total.metricLabel || ""}）</h4>
      <div>${total.summary || ""}</div>
      <div style="margin-top:8px;">
        🎯 全体${targetLabel}: <b>${fmt(total.overallTarget)}</b> 円<br>
        📊 業種合計${targetLabel}: <b>${fmt(total.totalTarget)}</b> 円 ${matchBadge}<br>
        👥 総営業人数: <b>${total.totalMembers || 0}</b> 名<br>
        📦 必要受注総数: <b>${total.totalNeedDeals || 0}</b> 件 / 1日 <b>${total.dailyDeals || 0}</b> 件<br>
        📅 営業日数: 約 <b>${total.businessDays || 0}</b> 日<br>
        🏢 対象業種数: <b>${segs.length}</b> 種
      </div>

      <h5 style="margin-top:12px;">📈 業種別の目標構成比</h5>
      ${renderShareTable(segs, total)}

      <h5 style="margin-top:12px;">🎯 全体共通KPI</h5>
      ${renderKpiList(total.kpis)}

      <h5 style="margin-top:12px;">🧩 全体タスク</h5>
      <div>${(total.actions||[]).map(a=>"・"+a).join("<br>") || "(なし)"}</div>
    </div>
  `;

  if (segs.length === 0) {
    html += `<div class="segment-block">業種別データが空です。</div>`;
  } else {
    segs.forEach((s, idx) => {
      html += renderSegmentBlock(s, idx, total);
    });
  }

  $("kpiOutput").innerHTML = html;

  // 実績入力欄
  let resHtml = "";
  segs.forEach((s, idx) => {
    resHtml += `
      <div class="segment-block">
        <h4>📊 ${idx+1}. ${s.industryLabel} の実績入力</h4>
        <div class="grid">
          ${(s.kpis || []).map((k, i) => `
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

function renderShareTable(segs, total) {
  if (!segs.length || !total.totalTarget) return "<small>(データ不足)</small>";
  const rows = segs.map((s, i) => {
    const share = Math.round((s.target / total.totalTarget) * 100);
    return `
      <tr>
        <td style="padding:6px;">${i+1}</td>
        <td style="padding:6px;">${s.industryLabel}</td>
        <td style="padding:6px;text-align:right;">${fmt(s.target)} 円</td>
        <td style="padding:6px;text-align:right;">${share}%</td>
        <td style="padding:6px;text-align:right;">${s.members} 名</td>
        <td style="padding:6px;text-align:right;">${s.needDeals} 件</td>
      </tr>`;
  }).join("");
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:6px;">
      <thead style="background:#fef3c7;">
        <tr>
          <th style="padding:6px;">#</th>
          <th style="padding:6px;text-align:left;">業種</th>
          <th style="padding:6px;text-align:right;">${total.targetLabel}</th>
          <th style="padding:6px;text-align:right;">構成比</th>
          <th style="padding:6px;text-align:right;">人数</th>
          <th style="padding:6px;text-align:right;">必要受注</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderKpiList(kpis) {
  if (!Array.isArray(kpis) || !kpis.length) return "<small>(KPIなし)</small>";
  return kpis.map((k,i) => `
    <div class="kpi-item">
      <b>${i+1}. ${k.name}</b>：${k.target} ${k.unit}<br>
      <small>${k.reason || ""}</small>
    </div>`).join("");
}

function renderSegmentBlock(s, idx, total) {
  const targetLabel = total.targetLabel || "目標";
  const unitLabel   = total.unitLabel   || "単価";
  const personsHtml = (s.persons || []).map((p) => `
    <div class="kpi-item" style="background:#f8fafc;">
      <b>${p.name}</b>：${targetLabel} <b>${fmt(p.target)}</b>円
      / 必要受注 <b>${p.needDeals}</b>件 / 1日 <b>${p.dailyDeals}</b>件
      / 構成比 <b>${p.shareRate || 0}%</b>
      ${p.comment ? `<br><small>💬 ${p.comment}</small>` : ""}
    </div>`).join("");

  return `
    <div class="segment-block">
      <h4>📊 ${idx+1}. ${s.industryLabel}</h4>
      <div>${s.summary || ""}</div>
      <div style="margin-top:6px;">
        ${targetLabel}: <b>${fmt(s.target)}</b>円 /
        ${unitLabel}: <b>${fmt(s.unit)}</b>円 /
        営業人数: <b>${s.members}</b>名<br>
        必要受注数: <b>${s.needDeals}</b>件 / 1人 <b>${s.perPerson}</b>件 / 1日 <b>${s.dailyDeals}</b>件
      </div>
      <h5 style="margin-top:10px;">👥 担当者別の割当・所感</h5>
      ${personsHtml || "<small>担当者データなし</small>"}
      <h5 style="margin-top:10px;">🎯 推奨KPI</h5>
      ${renderKpiList(s.kpis)}
      <h5 style="margin-top:10px;">🧩 日次アクション</h5>
      <div>${(s.actions||[]).map(a=>"・"+a).join("<br>") || "(なし)"}</div>
      <h5 style="margin-top:10px;">📚 参照フレームワーク</h5>
      <div><small>${s.framework || ""}</small></div>
    </div>
  `;
}

// ============================================================
// 実績評価
// ============================================================
$("btnEvaluate").addEventListener("click", async () => {
  if (!lastDesignResult) return;
  const segs = lastDesignResult.segments || [];
  const segmentResults = segs.map((s, sIdx) => ({
    industryLabel: s.industryLabel,
    results: (s.kpis || []).map((k, kIdx) => ({
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
    console.log("[Evaluate Response]", data);
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
    console.error(e);
    alert("エラー: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "実績を評価する";
  }
});
