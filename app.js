const WORKER_URL = "https://sales-kpi-agent.gmo-k-watanabe.workers.dev";

const INDUSTRIES = [
  "", "機械・製造","建設・不動産","小売","EC・通販","官公庁・団体",
  "飲食・宿泊","医療・介護","美容・ヘルスケア","教育・スクール",
  "人材・コンサル","士業・法律","金融・保険","物流・運輸",
  "レジャー・エンタメ","冠婚葬祭","IT・情報通信","生活サービス",
  "ペット・ホビー","広告・メディア","卸売・商社",
];

let segmentCounter = 0;
let lastDesignResult = null; // 実績評価用に保持

const $ = (id) => document.getElementById(id);

// ---- 業種選択肢生成 ----
function industryOptions(selected = "") {
  return INDUSTRIES.map(v => {
    const label = v === "" ? "指定無し" : v;
    const sel = v === selected ? "selected" : "";
    return `<option value="${v}" ${sel}>${label}</option>`;
  }).join("");
}

// ---- 指標ラベル ----
function getMetricLabels() {
  const m = $("metricType").value;
  return m === "gross"
    ? { targetLabel: "粗利目標（円）", unitLabel: "平均粗利単価（円）" }
    : { targetLabel: "売上目標（円）", unitLabel: "平均顧客単価（円）" };
}

// ---- 業種行を追加 ----
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
  `;
  row.querySelector(".btn-remove").addEventListener("click", () => {
    if (document.querySelectorAll(".segment-row").length <= 1) {
      alert("最低1行は必要です");
      return;
    }
    row.remove();
  });
  $("segmentList").appendChild(row);
}

// ---- 指標切替時：全行のラベル更新 ----
function syncAllSegmentLabels() {
  const { targetLabel, unitLabel } = getMetricLabels();
  document.querySelectorAll(".seg-target-label").forEach(e => e.textContent = targetLabel);
  document.querySelectorAll(".seg-unit-label").forEach(e => e.textContent = unitLabel);
}
$("metricType").addEventListener("change", syncAllSegmentLabels);

// ---- 初期表示：1行 ----
addSegmentRow();
$("btnAddSegment").addEventListener("click", () => addSegmentRow());

// ---- 入力収集 ----
function collectSegments() {
  const rows = document.querySelectorAll(".segment-row");
  const segments = [];
  rows.forEach(r => {
    const industry = r.querySelector(".seg-industry").value;
    const target   = Number(r.querySelector(".seg-target").value || 0);
    const unit     = Number(r.querySelector(".seg-unit").value || 0);
    const members  = Number(r.querySelector(".seg-members").value || 1);
    if (target > 0 && unit > 0) {
      segments.push({ industry, target, unit, members });
    }
  });
  return segments;
}

// ---- KPI設計実行 ----
$("btnDesign").addEventListener("click", async () => {
  const segments = collectSegments();
  if (segments.length === 0) {
    alert("少なくとも1つの業種に有効な目標と単価を入力してください");
    return;
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

// ---- 結果描画 ----
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

  // 実績入力欄を業種ごとに生成
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

// ---- 実績評価 ----
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
