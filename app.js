const WORKER_URL = "https://sales-kpi-agent.gmo-k-watanabe.workers.dev";

let currentKpis = []; // KPI項目を保持

const $ = (id) => document.getElementById(id);

// ---- KPI設計実行 ----
$("btnDesign").addEventListener("click", async () => {
  const payload = {
    action: "design",
    industry:  $("industry").value,
    purpose:   $("purpose").value,
    period:    $("period").value,
    target:    Number($("target").value || 0),
    members:   Number($("members").value || 1),
    unitPrice: Number($("unitPrice").value || 1),
  };
  if (!payload.target || !payload.unitPrice) {
    alert("売上目標と顧客単価は必須です");
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

  const out = $("kpiOutput");
  out.innerHTML = `
    <h3>📊 目標分解サマリー</h3>
    <div class="kpi-item">${data.summary || ""}</div>
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

  // 実績入力欄を生成
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
