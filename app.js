// Investicija – Inputs + Summary MVP
// Početna strana PRAZNA, procente korisnik unosi kao ceo broj (12 = 12%)

const DEFAULTS = {
  startDate: "2027-01-04",
  modelMonths: 24,
  constructionMonths: 14,
  salesMonths: 6,

  sellableArea: 476,
  salePricePerSqm: 2500,

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

const SALES_PCTS_6 = [0.10, 0.15, 0.20, 0.20, 0.20, 0.15];
const el = (id) => document.getElementById(id);

function money(x) {
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("sr-RS", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(x);
}
function num(x, d = 4) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(d);
}

function isPctField(k) {
  return [
    "softCostPct",
    "contingencyPct",
    "marketingPct",
    "interestRateAnnual",
    "bankFeePct",
    "corporateTaxPct",
  ].includes(k);
}

function readInputs() {
  const obj = {};
  for (const k of Object.keys(DEFAULTS)) {
    const n = el(k);
    if (!n) continue;
    if (n.type === "date") obj[k] = n.value;
    else {
      let v = Number(n.value);
      if (isPctField(k)) v = v / 100;
      obj[k] = v;
    }
  }
  return obj;
}

function setInputs(values) {
  for (const [k, v] of Object.entries(values)) {
    const n = el(k);
    if (!n) continue;
    if (n.type === "date") n.value = v;
    else n.value = isPctField(k) ? v * 100 : v;
  }
}

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
  };
}

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

function render(sim, be) {
  el("kpiRevenue").textContent = money(sim.revenue);
  el("kpiCostsNoInterest").textContent = money(sim.costsNoInterest);
  el("kpiInterest").textContent = money(sim.totalInterest);
  el("kpiPeakCredit").textContent = money(sim.peakCredit);
  el("kpiTax").textContent = money(sim.tax);
  el("kpiNetProfit").textContent = money(sim.netProfit);
  el("kpiRoi").textContent = num(sim.roi, 6);
  el("kpiBePrice").textContent = `${be.toFixed(2)} €/m²`;
}

function calc() {
  const p = readInputs();
  const sim = runSimulation(p);
  const be = breakEvenPrice(p);
  render(sim, be);
}

function init() {
  el("btnCalc").onclick = calc;
  el("btnReset").onclick = () => setInputs(DEFAULTS);
}

init();
