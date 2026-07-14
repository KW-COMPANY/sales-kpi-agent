// File: app.js
const WORKER_URL = "https://sales-kpi-agent.gmo-k-watanabe.workers.dev";

const INDUSTRIES = [
  "", "機械・製造","建設・不動産","小売","EC・通販","官公庁・団体",
  "飲食・宿泊","医療・介護","美容・ヘルスケア","教育・スクール",
  "人材・コンサル","士業・法律","金融・保険","物流・運輸",
  "レジャー・エンタメ","冠婚葬祭","IT・情報通信","生活サービス",
  "ペット・ホビー","広告・メディア","卸売・商社",
];

const PURPOSES = [
  { value: "新規開拓",       label: "新規顧客開拓" },
  { value: "既存アップセル", label: "既存アップセル" },
  { value: "既存契約の更新", label: "既存契約の更新" },
  { value: "新商材の販売",   label: "新商材の販売" },
];

let segmentCounter = 0;
let lastDesignResult = null;
const statsCache = {}; // 業種別の過去実績キャッシュ（UI表示用）

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString();

// ============================================================
// トースト通知
// ============================================================
function showToast(message, type = "default", duration = 3000) {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = "toast is-active" + (type !== "default" ? " " + type : "");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("is-active");
  }, duration);
}

// ============================================================
// ローディングオーバーレイ
// ============================================================
function showLoading(message = "AIが分析中です…") {
  $("loadingMessage").textContent = message;
  $("loadingOverlay").classList.add("is-active");
}
function hideLoading() {
  $("loadingOverlay").classList.remove("is-active");
}

// ============================================================
// STEPインジケーター更新
// ============================================================
function setActiveStep(stepNum) {
  const items = document.querySelectorAll(".step-item");
  const lines = document.querySelectorAll(".step-line");
  items.forEach((item, idx) => {
    const num = idx + 1;
    item.classList.remove("active", "done");
    if (num < stepNum) item.classList.add("done");
    else if (num === stepNum) item.classList.add("active");
  });
  lines.forEach((line, idx) => {
    line.classList.toggle("done", idx + 1 < stepNum);
  });
}

// ============================================================
// 販売目的オプション生成
// ============================================================
function purposeOptions(selected = "新規開拓") {
  return PURPOSES.map(p =>
    `<option value="${p.value}" ${p.value === selected ? "selected" : ""}>${p.label}</option>`
  ).join("");
}

// ============================================================
// 業種オプション生成
// ============================================================
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
// 金額のリアルタイム表示（日本語換算）
// ============================================================
function formatJPY(n) {
  const num = Number(n || 0);
  if (num === 0) return "";
  if (num >= 100000000) return `${(num / 100000000).toFixed(num % 100000000 === 0 ? 0 : 1)}億円`;
  if (num >= 10000) return `${(num / 10000).toFixed(num % 10000 === 0 ? 0 : 1)}万円`;
  return `${num.toLocaleString()}円`;
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

  $("overallTargetDisplay").textContent = overall ? formatJPY(overall) : "";

  if (!overall) {
    sumEl.className = "persons-summary";
    sumEl.innerHTML = `⬆️ ${targetLabel}を入力してください`;
    return;
  }
  if (segSum === 0) {
    sumEl.className = "persons-summary warn";
    sumEl.innerHTML = `🎯 全体${targetLabel.replace("（円）","")}: <b>${fmt(overall)}</b>円（${formatJPY(overall)}） / 業種合計: <b>0</b>円 → 「✨目標を均等配分」を押すか業種ごとに入力してください`;
    return;
  }
  const diff = segSum - overall;
  if (diff === 0) {
    sumEl.className = "persons-summary ok";
    sumEl.innerHTML = `✅ 業種合計: <b>${fmt(segSum)}</b>円（${formatJPY(segSum)}）— 全体${targetLabel.replace("（円）","")}と一致`;
  } else {
    sumEl.className = "persons-summary warn";
    const sign = diff > 0 ? "超過" : "不足";
    sumEl.innerHTML = `⚠️ 全体${targetLabel.replace("（円）","")}: <b>${fmt(overall)}</b>円 / 業種合計: <b>${fmt(segSum)}</b>円（${formatJPY(segSum)}） → <b>${fmt(Math.abs(diff))}円 ${sign}</b>`;
  }
}

// ============================================================
// 【Closed Loop・UI】業種の過去実績を取得してバッジ表示
// ============================================================
async function fetchIndustryStats(industry) {
  if (!industry) return null;
  if (statsCache[industry] !== undefined) return statsCache[industry];
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "industryStats", industry }),
    });
    const data = await res.json();
    if (data && !data.error) {
      statsCache[industry] = data;
      return data;
    }
  } catch (_) {}
  statsCache[industry] = null;
  return null;
}

function renderStatsBadge(stats) {
  if (!stats || !stats.count) {
    return `<span class="stats-badge stats-empty" title="まだ実績データがありません。運用するほど蓄積されます">📊 実績データ蓄積中</span>`;
  }
  const rate = stats.avgRate;
  const cls = rate == null ? "stats-empty"
            : rate >= 100 ? "stats-high"
            : rate >= 80  ? "stats-mid"
            : "stats-low";
  const rateText = rate == null ? "—" : `${rate}%`;
  const fb = (stats.thumbsUp || stats.thumbsDown)
    ? ` ・ 👍${stats.thumbsUp || 0}/👎${stats.thumbsDown || 0}`
    : "";
  return `<span class="stats-badge ${cls}" title="過去${stats.count}回分の平均達成率。AIが次回設計に自動反映します">📈 過去平均達成率 ${rateText}（${stats.count}回）${fb}</span>`;
}

async function updateSegmentStats(row) {
  const industry = row.querySelector(".seg-industry").value;
  const badgeEl = row.querySelector(".seg-stats-badge");
  if (!badgeEl) return;
  if (!industry) {
    badgeEl.innerHTML = "";
    return;
  }
  badgeEl.innerHTML = `<span class="stats-badge stats-empty">📊 実績を確認中…</span>`;
  const stats = await fetchIndustryStats(industry);
  badgeEl.innerHTML = renderStatsBadge(stats);
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
    <label title="この業種の販売目的を選択してください">販売目的
      <select class="seg-purpose">${purposeOptions(preset.purpose || "新規開拓")}</select>
    </label>
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
    <button type="button" class="btn-remove" title="この業種行を削除します">削除</button>
    <div class="seg-stats-badge"></div>
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
      showToast("最低1行は必要です", "error");
      return;
    }
    row.remove();
    updateOverallSummary();
  });

  const targetInput  = row.querySelector(".seg-target");
  const membersInput = row.querySelector(".seg-members");
  const industrySel  = row.querySelector(".seg-industry");
  targetInput.addEventListener("input", () => {
    rebuildPersons(row, true);
    updateOverallSummary();
  });
  membersInput.addEventListener("input", () => rebuildPersons(row, true));
  row.querySelector(".btn-redistribute").addEventListener("click", () => rebuildPersons(row, true));
  // 【Closed Loop・UI】業種変更時に過去実績バッジ更新
  industrySel.addEventListener("change", () => updateSegmentStats(row));

  $("segmentList").appendChild(row);
  rebuildPersons(row, true);
  updateOverallSummary();
  updateSegmentStats(row); // 初期表示（presetに業種があれば取得）
}

// ============================================================
// 全体目標を均等配分
// ============================================================
function distributeToSegments() {
  const overall = Number($("overallTarget").value || 0);
  const rows = document.querySelectorAll(".segment-row");
  if (!overall) {
    showToast("先に全体目標を入力してください", "error");
    return;
  }
  if (rows.length === 0) {
    showToast("業種行が存在しません", "error");
    return;
  }

  const baseShare = Math.floor(overall / rows.length / 10000) * 10000;
  let used = 0;
  rows.forEach((r, idx) => {
    let share = baseShare;
    if (idx === rows.length - 1) share = overall - used;
    used += share;
    r.querySelector(".seg-target").value = share;
    rebuildPersons(r, true);
  });
  updateOverallSummary();
  showToast(`✅ ${rows.length}目標を均等配分しました`, "success");
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
    const purpose  = r.querySelector(".seg-purpose").value;
    const industry = r.querySelector(".seg-industry").value;
    const target   = Number(r.querySelector(".seg-target").value || 0);
    const unit     = Number(r.querySelector(".seg-unit").value || 0);
    const members  = Number(r.querySelector(".seg-members").value || 1);
    const persons  = Array.from(r.querySelectorAll(".person-target"))
                          .map((i, k) => ({ name: `担当者${k + 1}`, target: Number(i.value || 0) }));
    const personSum = persons.reduce((s, p) => s + p.target, 0);
    if (personSum !== target && target > 0) hasMismatch = true;

    if (target > 0 && unit > 0) {
      segments.push({ purpose, industry, target, unit, members, persons, personSum });
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
    showToast("全体目標を入力してください", "error");
    return;
  }

  const { segments, hasMismatch } = collectSegments();
  if (segments.length === 0) {
    showToast("少なくとも1つの業種に有効な目標と単価を入力してください", "error");
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
    period:     $("period").value,
    metricType: $("metricType").value,
    overallTarget,
    segments,
    purpose: segments.map(s => s.purpose).join("・"),
  };

  const btn = $("btnDesign");
  btn.disabled = true;
  setActiveStep(3);
  showLoading("AIが業種・販売目的別ナレッジと過去実績を参照しながら分析中…");

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
    showToast("✅ KPI設計が完了しました", "success");
    setTimeout(() => {
      $("kpiSection").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  } catch (e) {
    console.error(e);
    showToast("エラー: " + e.message, "error", 5000);
    setActiveStep(2);
  } finally {
    btn.disabled = false;
    hideLoading();
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

  const matchBadge = total.overallTarget === total.totalTarget
    ? `<span style="color:#047857;font-weight:700;">✅ 全体目標と一致</span>`
    : `<span style="color:#b45309;font-weight:700;">⚠️ 全体目標と差異あり</span>`;

  let html = `
    <div class="total-block">
      <h4>🏆 合計サマリー（全業種合算 / ${total.metricLabel || ""}）</h4>
      <div>${total.summary || ""}</div>
      <div style="margin-top:10px;line-height:2;">
        🎯 全体${targetLabel}: <b>${fmt(total.overallTarget)}</b> 円（${formatJPY(total.overallTarget)}）<br>
        📊 業種合計${targetLabel}: <b>${fmt(total.totalTarget)}</b> 円 ${matchBadge}<br>
        👥 総営業人数: <b>${total.totalMembers || 0}</b> 名<br>
        📦 必要受注総数: <b>${total.totalNeedDeals || 0}</b> 件 / 1日 <b>${total.dailyDeals || 0}</b> 件<br>
        📅 営業日数: 約 <b>${total.businessDays || 0}</b> 日<br>
        🏢 対象業種数: <b>${segs.length}</b> 種
      </div>
      ${total.nextStepAdvice ? `<div class="next-advice">💡 <b>次のステップ:</b> ${total.nextStepAdvice}</div>` : ""}

      <h5>📈 業種別の目標構成比</h5>
      ${renderShareTable(segs, total)}

      <h5>🎯 全体共通KPI</h5>
      ${renderKpiList(total.kpis)}

      <h5>🧩 全体タスク</h5>
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

  // 【Closed Loop・UI】設計結果への👍👎フィードバックをバインド
  bindDesignFeedback(segs);

  let resHtml = "";
  segs.forEach((s, idx) => {
    resHtml += `
      <div class="segment-block">
        <h4>📊 ${idx+1}. ${s.industryLabel} の実績入力</h4>
        <div class="grid">
          ${(s.kpis || []).map((k, i) => `
            <label>${k.name}（目標: ${k.target}${k.unit}）
              <input type="number" class="result-input"
                     data-seg="${idx}" data-idx="${i}"
                     placeholder="実績を入力"
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
    const barWidth = Math.min(share, 100);
    return `
      <tr>
        <td style="padding:7px 8px;color:var(--text-muted);font-size:12px;">${i+1}</td>
        <td style="padding:7px 8px;font-weight:600;">${s.industryLabel}</td>
        <td style="padding:7px 8px;font-size:12px;color:var(--text-muted);">${s.purposeLabel || ""}</td>
        <td style="padding:7px 8px;text-align:right;">${fmt(s.target)} 円<br><small style="color:var(--text-muted)">${formatJPY(s.target)}</small></td>
        <td style="padding:7px 8px;text-align:right;">
          <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
            <div style="width:60px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
              <div style="width:${barWidth}%;height:100%;background:var(--accent);border-radius:3px;"></div>
            </div>
            <span style="font-weight:700;min-width:32px;text-align:right;">${share}%</span>
          </div>
        </td>
        <td style="padding:7px 8px;text-align:right;">${s.members} 名</td>
        <td style="padding:7px 8px;text-align:right;">${s.needDeals} 件</td>
      </tr>`;
  }).join("");
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
      <thead style="background:var(--warning-light);">
        <tr>
          <th style="padding:8px;text-align:left;font-size:12px;">#</th>
          <th style="padding:8px;text-align:left;font-size:12px;">業種</th>
          <th style="padding:8px;text-align:left;font-size:12px;">販売目的</th>
          <th style="padding:8px;text-align:right;font-size:12px;">${total.targetLabel}</th>
          <th style="padding:8px;text-align:right;font-size:12px;">構成比</th>
          <th style="padding:8px;text-align:right;font-size:12px;">人数</th>
          <th style="padding:8px;text-align:right;font-size:12px;">必要受注</th>
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
      <small style="color:var(--text-muted)">${k.reason || ""}</small>
    </div>`).join("");
}

function renderSegmentBlock(s, idx, total) {
  const targetLabel = total.targetLabel || "目標";
  const unitLabel   = total.unitLabel   || "単価";
  const personsHtml = (s.persons || []).map((p) => `
    <div class="kpi-item" style="background:#f8fafc;padding:8px 10px;border-radius:6px;margin-bottom:6px;border:none;">
      <b>${p.name}</b>：${targetLabel} <b>${fmt(p.target)}</b>円（${formatJPY(p.target)}）
      / 必要受注 <b>${p.needDeals}</b>件 / 1日 <b>${p.dailyDeals}</b>件
      / 構成比 <b>${p.shareRate || 0}%</b>
      ${p.comment ? `<br><small style="color:var(--text-muted)">💬 ${p.comment}</small>` : ""}
    </div>`).join("");

  const riskHtml = s.riskNote
    ? `<div class="risk-note">⚠️ ${s.riskNote}</div>`
    : "";

  const knowledgeHtml = s.industryKnowledge
    ? `<details style="margin-top:8px;">
        <summary style="font-size:12px;color:var(--primary);cursor:pointer;font-weight:600;">🔗 参照した業種ナレッジ（外部KV）</summary>
        <div style="font-size:12px;color:var(--text-muted);padding:6px 0;">${s.industryKnowledge}</div>
      </details>`
    : "";

  // 【Closed Loop・UI】過去実績を学習に反映したことを明示
  const learningHtml = s.learningApplied
    ? `<div class="learning-note">📈 <b>過去実績を学習済み:</b> この業種の過去平均達成率${s.pastAvgRate != null ? `（約${s.pastAvgRate}%）` : ""}を踏まえてKPIを自動補正しました。</div>`
    : "";

  // 【Closed Loop・UI】設計結果へのフィードバックボタン
  const feedbackHtml = `
    <div class="feedback-bar" data-industry="${encodeURIComponent(s.industryLabel)}" data-purpose="${encodeURIComponent(s.purposeLabel || "")}" data-context="design">
      <span class="feedback-label">この設計は役立ちましたか？（AIの学習に反映されます）</span>
      <button type="button" class="btn-feedback" data-vote="up" title="役立った">👍 役立った</button>
      <button type="button" class="btn-feedback" data-vote="down" title="いまいち">👎 いまいち</button>
      <span class="feedback-thanks" hidden>✅ フィードバックを学習に反映しました</span>
    </div>`;

  return `
    <div class="segment-block">
      <h4>📊 ${idx+1}. ${s.industryLabel}
        <span style="font-size:13px;font-weight:600;color:#7c3aed;margin-left:8px;">／ ${s.purposeLabel || ""}</span>
      </h4>
      ${learningHtml}
      <div>${s.summary || ""}</div>
      <div style="margin-top:8px;line-height:1.9;font-size:13px;">
        ${targetLabel}: <b>${fmt(s.target)}</b>円（${formatJPY(s.target)}）/
        ${unitLabel}: <b>${fmt(s.unit)}</b>円 /
        営業人数: <b>${s.members}</b>名<br>
        必要受注数: <b>${s.needDeals}</b>件 / 1人 <b>${s.perPerson}</b>件 / 1日 <b>${s.dailyDeals}</b>件
      </div>
      ${riskHtml}
      <h5>👥 担当者別の割当・所感</h5>
      ${personsHtml || "<small>担当者データなし</small>"}
      <h5>🎯 推奨KPI</h5>
      ${renderKpiList(s.kpis)}
      <h5>🧩 日次アクション</h5>
      <div style="font-size:13px;">${(s.actions||[]).map(a=>"・"+a).join("<br>") || "(なし)"}</div>
      <h5>📚 参照フレームワーク</h5>
      <div><small style="color:var(--text-muted)">${s.framework || ""}</small></div>
      ${knowledgeHtml}
      ${feedbackHtml}
    </div>
  `;
}

// ============================================================
// 【Closed Loop】フィードバック送信共通関数
// ============================================================
async function sendFeedback(payload) {
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feedback", ...payload }),
    });
    const data = await res.json();
    return data && data.ok;
  } catch (e) {
    console.error("feedback failed:", e);
    return false;
  }
}

// ============================================================
// 【Closed Loop】設計結果の👍👎バインド
// ============================================================
function bindDesignFeedback(segs) {
  document.querySelectorAll("#kpiOutput .feedback-bar").forEach(bar => {
    const industry = decodeURIComponent(bar.dataset.industry || "");
    const purpose  = decodeURIComponent(bar.dataset.purpose || "");
    bar.querySelectorAll(".btn-feedback").forEach(btn => {
      btn.addEventListener("click", async () => {
        const vote = btn.dataset.vote;
        bar.querySelectorAll(".btn-feedback").forEach(b => b.disabled = true);
        const ok = await sendFeedback({ industry, purpose, vote, context: "design" });
        if (ok) {
          bar.querySelector(".feedback-thanks").hidden = false;
          showToast(vote === "up" ? "👍 学習に反映しました" : "👎 次回の改善に反映します", "success");
        } else {
          bar.querySelectorAll(".btn-feedback").forEach(b => b.disabled = false);
          showToast("フィードバック送信に失敗しました", "error");
        }
      });
    });
  });
}

// ============================================================
// コピー機能
// ============================================================
$("btnCopyResult").addEventListener("click", () => {
  const text = $("kpiOutput").innerText;
  navigator.clipboard.writeText(text).then(() => {
    showToast("📋 結果をクリップボードにコピーしました", "success");
  }).catch(() => {
    showToast("コピーに失敗しました", "error");
  });
});

// ============================================================
// 印刷/PDF出力
// ============================================================
$("btnPrintResult").addEventListener("click", () => {
  window.print();
});

// ============================================================
// 実績評価
// ============================================================
$("btnEvaluate").addEventListener("click", async () => {
  if (!lastDesignResult) return;
  const segs = lastDesignResult.segments || [];
  const segmentResults = segs.map((s, sIdx) => ({
    industryLabel: s.industryLabel,
    purposeLabel:  s.purposeLabel || "",
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
  setActiveStep(4);
  showLoading("実績を評価中…");

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
        ${data.priorityAction ? `<div class="next-advice" style="margin-top:10px;">🚀 <b>次期最優先アクション:</b> ${data.priorityAction}</div>` : ""}
      </div>
    `;
    (data.perSegment || []).forEach((p, i) => {
      html += `
        <div class="segment-block">
          <h4>📊 ${i+1}. ${p.industryLabel}
            <span style="font-size:13px;font-weight:600;color:#7c3aed;margin-left:8px;">／ ${p.purposeLabel || ""}</span>
          </h4>
          <div>${p.evaluation || ""}</div>
          <h5>💡 改善アクション</h5>
          <div style="font-size:13px;">${(p.improvements||[]).map(s => "・"+s).join("<br>")}</div>
          <div class="feedback-bar" data-industry="${encodeURIComponent(p.industryLabel)}" data-purpose="${encodeURIComponent(p.purposeLabel || "")}" data-context="evaluate">
            <span class="feedback-label">この評価・改善案を採用しますか？（AIの学習に反映されます）</span>
            <button type="button" class="btn-feedback btn-approve" data-decision="approved" title="承認">✅ 承認して採用</button>
            <button type="button" class="btn-feedback btn-reject" data-decision="rejected" title="却下">🚫 却下</button>
            <span class="feedback-thanks" hidden>✅ 判断を学習に反映しました</span>
          </div>
        </div>
      `;
    });
    $("evalOutput").innerHTML = html;

    // 【Closed Loop】評価結果への承認/却下バインド
    bindEvaluateFeedback();

    showToast("✅ 実績評価が完了しました", "success");
    setTimeout(() => {
      $("evalOutput").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  } catch (e) {
    console.error(e);
    showToast("エラー: " + e.message, "error", 5000);
  } finally {
    btn.disabled = false;
    hideLoading();
  }
});

// ============================================================
// 【Closed Loop】評価結果の承認/却下バインド
// ============================================================
function bindEvaluateFeedback() {
  document.querySelectorAll("#evalOutput .feedback-bar").forEach(bar => {
    const industry = decodeURIComponent(bar.dataset.industry || "");
    const purpose  = decodeURIComponent(bar.dataset.purpose || "");
    bar.querySelectorAll(".btn-feedback").forEach(btn => {
      btn.addEventListener("click", async () => {
        const decision = btn.dataset.decision;
        bar.querySelectorAll(".btn-feedback").forEach(b => b.disabled = true);
        const ok = await sendFeedback({ industry, purpose, decision, context: "evaluate" });
        if (ok) {
          bar.querySelector(".feedback-thanks").hidden = false;
          statsCache[industry] = undefined; // 次回取得時に最新化
          showToast(decision === "approved" ? "✅ 承認を学習に反映しました" : "🚫 却下を学習に反映しました", "success");
        } else {
          bar.querySelectorAll(".btn-feedback").forEach(b => b.disabled = false);
          showToast("フィードバック送信に失敗しました", "error");
        }
      });
    });
  });
}
