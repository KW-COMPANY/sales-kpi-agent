const WORKER_URL = "https://sales-kpi-agent.gmo-k-watanabe.workers.dev/";

let currentKpis = [];
const $ = (id) => document.getElementById(id);

// ---- ラベル動的切替 ----
function syncLabels() {
  const tt = $("targetType").value;
  const ut = $("unitType").value;
  $("targetLabel").textContent = tt === "gross" ? "粗利目標（円）" : "売上目標（円）";
  $("unitLabel").textContent   = ut === "gross" ? "平均粗利単価（円）" : "平均顧客単価（円）";

  // 「粗利目標 × 売上単価」または「売上目標 × 粗利単価」のミックス時は粗利率が必要
  const needMargin = (tt !== ut);
  $("marginWrap").hidden = !needMargin;
}
$("targetType").addEventListener("change", syncLabels);
$("unitType").addEventListener("change", syncLabels);
syncLabels();

// ---- KPI設計実行 ----
$("btnDesign").addEventListener("click", async () => {
  const targetType = $("targetType").value;  // sales | gross
  const unitType   = $("unitType").value;    // sales | gross
  const marginRate = Number($("marginRate").value || 0);

  const payload = {
    action: "design",
    industry:   $("industry").value,
    purpose:    $("purpose").value,
    period:     $("period").value,
    targetType,
    unitType,
    marginRate,
    target:     Number($("target").value || 0),
    members:    Number($("members").value || 1),
    unitPrice:  Number($("unitPrice").value || 1),
  };

  if (!payload.target || !payload.unitPrice) {
    alert("目標金額と単価は必須です");
    return;
  }
  if (targetType !== unitType && (!marginRate || marginRate <= 0 || marginRate >= 100)) {
    alert("目標と単価の種別が異なる場合は、想定粗利率(1〜99)を入力してください");
    return;
  }

  const btn = $("btnDesign");
  btn.disabled = true;
  btn.textContent = "AIが設計中…(最大30秒)";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderKpi(data);
  } catch (e) {
    alert("エラー: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "KPIを設計する";
  }
});

// ---- KPI描画 ----
function renderKpi(data) {
  $("kpiSection").hidden = false;
  $("resultSection").hidden = false;

  const meta = data.meta || {};
  const out = $("kpiOutput");
  out.innerHTML = `
    <h3>📊 目標分解サマリー</h3>
    <div class="kpi-item">${data.summary || ""}</div>

    <h3>🧮 計算ベース</h3>
    <div class="kpi-item">
      目標種別: <b>${meta.targetTypeLabel || "-"}</b><br>
      単価種別: <b>${meta.unitTypeLabel || "-"}</b><br>
      ${meta.marginRate ? `想定粗利率: <b>${meta.marginRate}%</b><br>` : ""}
      必要受注数: <b>${meta.needDeals}</b>件 / 1人 <b>${meta.perPerson}</b>件 / 1日 <b>${meta.dailyDeals}</b>件<br>
      参考: 売上換算 <b>${(meta.salesAmount || 0).toLocaleString()}</b>円 / 粗利換算 <b>${(meta.grossAmount || 0).toLocaleString()}</b>円
    </div>

    <h3>🎯 推奨KPI</h3>
    ${data.kpis.map((k, i) => `
      <div class="kpi-item">
        <b>${i + 1}. ${k.name}</b><br>
        目標値: <b>${k.target}</b> ${k.unit}<br>
        理由: ${k.reason}
      </div>`).join("")}

    <h3>🧩 タスク分解（日次アクション）</h3>
    <div class="kpi-item">${(data.actions || []).map(a => "・" + a).join("<br>")}</div>

    <h3>📚 参照フレームワーク</h3>
    <div class="kpi-item">${data.framework || "-"}</div>

    <h3>🌐 外部参考データ</h3>
    <div class="kpi-item">${data.external || "-"}</div>
  `;

  currentKpis = data.kpis;
  const inputs = $("resultInputs");
  inputs.innerHTML = currentKpis.map((k, i) => `
    <label>${k.name}の実績（${k.unit}）
      <input type="number" data-idx="${i}" class="result-input" />
    </label>
  `).join("");
}

// ---- 実績評価 ----
$("btnEvaluate").addEventListener("click", async () => {
  const results = currentKpis.map((k, i) => ({
    name: k.name,
    target: k.target,
    unit: k.unit,
    actual: Number(document.querySelector(`.result-input[data-idx="${i}"]`).value || 0),
  }));

  const btn = $("btnEvaluate");
  btn.disabled = true;
  btn.textContent = "評価中…";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "evaluate", results }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    $("evalOutput").innerHTML = `
      <h3>✅ 達成度評価</h3>
      ${data.evaluation || ""}
      <h3>💡 改善アクション</h3>
      ${(data.improvements || []).map(s => "・" + s).join("<br>")}
    `;
  } catch (e) {
    alert("エラー: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "実績を評価する";
  }
});
