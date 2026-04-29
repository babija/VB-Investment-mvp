// Investicija – Inputs + Summary MVP
// Izvedeno po logici i mapiranju polja iz:
// Investicija_App_Developer_Handover_v1.docx
// investicija_PEP_Risk.xlsx
// MVP baseline (CashFlow parity u sledećoj iteraciji)

// ================== DEFAULTS (EXCEL REFERENCE) ==================
const DEFAULTS = {
  startDate: "2027-01-04",
  modelMonths: 24,
  constructionMonths: 14,
  salesMonths: 6,

  sellableArea: 476,
  salePricePerSqm: 2500,

  // ⚠️ DEFAULTS OSTAJU U DECIMALAMA (EXCEL LOGIKA)
  constructionCostPerSqm: 1000,
  softCostPct: 0.12,
  contingencyPct: 0.07,
  landCost: 70000,
  permitsCost: 20000,
  marketingPct: 0.02,
  otherReserve: 0,

  equity: 150000,
  interestRateAnnual: 0.075,
  bankFeePct: 0.01,
  bankFeeBaseLimit: 323080,
  corporateTaxPct: 0.10,
};

// Prodajni raspored
const SALES_PCTS_6 = [0.10, 0.15, 0.20, 0.20, 0.20, 0.15];

const el = (id) => document.getElementById(id);

// ================== FORMAT HELPERS ==================
function money(x) {
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("sr-RS", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(x);
}
function num(x, digits = 4) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

// ================== INPUT HANDLING ==================
function readInputs() {
  const obj = {};
  const keys = Object.keys(DEFAULTS);

  for (const k of keys) {
    const node = el(k);
    if (!node) continue;

    if (node.type === "date") {
      obj[k] = node.value;
    } else {
      let v = Number(node.value);

      // ✅ SVA POLJA KOJA SU PROCENTI → DELI SA 100
      if (
        k === "softCostPct" ||
        k === "contingencyPct" ||
        k === "marketingPct" ||
        k === "interestRateAnnual" ||
        k === "bankFeePct" ||
        k === "corporateTaxPct"
      ) {
        v = v / 100;
      }

      obj[k] = v;
    }
  }
  return obj;
}

function setInputs(values) {
  for (const [k, v] of Object.entries(values)) {
    const node = el(k);
    if (!node) continue;

    if (node.type === "date") {
      node.value = v;
    } else {
      // ✅ kod setovanja defaulta, procente vraćamo u %
      if (
        k === "softCostPct" ||
        k === "contingencyPct" ||
        k === "marketingPct" ||
        k === "interestRateAnnual" ||
        k === "bankFeePct" ||
        k === "corporateTaxPct"
      ) {
        node.value = v * 100;
      } else {
        node.value = v;
      }
    }
  }
}

// ================== DERIVED TOTALS ==================
function derivedTotals(p) {
  const revenue = p.sellableArea * p.salePricePerSqm;

  const hard = p.sellableArea * p.constructionCostPerSqm;
  const soft = hard * p.softCostPct;
  const contingency = hard * p.contingencyPct;
  const marketing = revenue * p.marketingPct;

  const bankFee = p.bankFeePct * p.bankFeeBaseLimit;

  const costsNoInterest =
    p.landCost +
    p.permitsCost +
    hard +
    soft +
    contingency +
    marketing +
    bankFee +
    p.otherReserve;

  return { revenue, hard, soft, contingency, marketing, bankFee, costsNoInterest };
}

// ================== CASHFLOW SIM ==================
function runSimulation(p) {
  const t = derivedTotals(p);

  const months = Math.max(1, Math.floor(p.modelMonths));
  const constM = Math.max(1, Math.floor(p.constructionMonths));
  const salesM = Math.max(1, Math.floor(p.salesMonths));
  const monthlyRate = p.interestRateAnnual / 12;

  const inflow = new Array(months).fill(0);
  const outflow = new Array(months).fill(0);

  const permitsPm = p.permitsCost / 3;

  if (months > 0) {
    outflow[0] += p.landCost + permitsPm + t.bankFee;
    inflow[0] += p.equity;
  }
  if (months > 1) outflow[1] += permitsPm;
  if (months > 2) outflow[2] += permitsPm;

  const hardPm = t.hard / constM;
  const softPm = t.soft / constM;
  const contPm = t.contingency / constM;
  const otherPm = p.otherReserve / constM;

  for (let m = 1; m <= constM && m < months; m++) {
    outflow[m] += hardPm + softPm + contPm + otherPm;
  }

  const marketingPm = t.marketing / salesM;
  for (let i = 0; i < salesM; i++) {
    const idx = constM + 1 + i;
    if (idx < months) outflow[idx] += marketingPm;
  }

  const pcts = salesM === 6 ? SALES_PCTS_6 : new Array(salesM).fill(1 / salesM);
  for (let i = 0; i < salesM; i++) {
    const idx = constM + 1 + i;
    if (idx < months) inflow[idx] += t.revenue * pcts[i];
  }

  let cash = 0;
  let credit = 0;
  let peakCredit = 0;
  let totalInterest = 0;

  for (let m = 0; m < months; m++) {
    cash += inflow[m] - outflow[m];

    if (credit > 0 && monthlyRate > 0) {
      const interest = credit * monthlyRate;
      totalInterest += interest;
      cash -= interest;
    }

    if (cash < 0) {
      credit += -cash;
      cash = 0;
    }

    if (cash > 0 && credit > 0) {
      const repay = Math.min(cash, credit);
      credit -= repay;
      cash -= repay;
    }

    peakCredit = Math.max(peakCredit, credit);
  }

  const profitBeforeTax = t.revenue - t.costsNoInterest - totalInterest;
  const tax = Math.max(0, profitBeforeTax * p.corporateTaxPct);
  const netProfit = profitBeforeTax - tax;
  const roi = p.equity > 0 ? netProfit / p.equity : NaN;

  return {
    ...t,
    totalInterest,
    peakCredit,
    profitBeforeTax,
    tax,
    netProfit,
    roi,
    cashEnd: cash,
  };
}

// ================== BREAK EVEN ==================
function breakEvenPrice(p) {
  let lo = 0;
  let hi = Math.max(5000, p.salePricePerSqm * 3);

  const f = (price) => runSimulation({ ...p, salePricePerSqm: price }).netProfit;

  while (f(hi) < 0) hi *= 1.5;

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// ================== RENDER ==================
function render(sim, bePrice) {
  el("kpiRevenue").textContent = money(sim.revenue);
  el("kpiCostsNoInterest").textContent = money(sim.costsNoInterest);
  el("kpiInterest").textContent = money(sim.totalInterest);
  el("kpiPeakCredit").textContent = money(sim.peakCredit);
  el("kpiTax").textContent = money(sim.tax);
  el("kpiNetProfit").textContent = money(sim.netProfit);
  el("kpiRoi").textContent = num(sim.roi, 6);
  el("kpiBePrice").textContent = `${bePrice.toFixed(2)} €/m²`;
}

// ================== INIT ==================
function calc() {
  const p = readInputs();
  const sim = runSimulation(p);
  const be = breakEvenPrice(p);
  render(sim, be);
}

function init() {
  el("btnReset").onclick = () => {
    setInputs(DEFAULTS);
    calc();
  };
  el("btnCalc").onclick = calc;

  setInputs(DEFAULTS);
  calc();
}

init();
