const form = document.querySelector('#authForm');
const adminKeyInput = document.querySelector('#adminKey');
const daysInput = document.querySelector('#days');
const statusNode = document.querySelector('#status');
const chart = document.querySelector('#chart');
const rows = document.querySelector('#dailyRows');

const nodes = {
  totalUsers: document.querySelector('#totalUsers'),
  todayUsers: document.querySelector('#todayUsers'),
  todayRevenue: document.querySelector('#todayRevenue'),
  totalRevenue: document.querySelector('#totalRevenue'),
  updatedAt: document.querySelector('#updatedAt'),
  localDate: document.querySelector('#localDate')
};

adminKeyInput.value = localStorage.getItem('adminApiKey') || '';

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', isError);
}

function money(amount, currency) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format((Number(amount) || 0) / 100);
}

function number(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value) || 0);
}

function renderChart(items, currency) {
  chart.innerHTML = '';
  chart.style.setProperty('--bars', Math.max(items.length, 1));
  const max = Math.max(...items.map((item) => item.revenue), 1);

  for (const item of items) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const height = Math.max((item.revenue / max) * 100, item.revenue > 0 ? 3 : 0);
    bar.style.setProperty('--height', `${height}%`);
    bar.dataset.label = `${item.date} · ${money(item.revenue, currency)} · ${number(item.paymentsCount)} 笔`;
    chart.appendChild(bar);
  }
}

function renderTable(items, currency) {
  rows.innerHTML = '';
  const latest = [...items].reverse();

  for (const item of latest) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.date}</td>
      <td>${money(item.revenue, currency)}</td>
      <td>${number(item.paymentsCount)}</td>
    `;
    rows.appendChild(tr);
  }
}

async function loadMetrics() {
  const key = adminKeyInput.value.trim();
  if (!key) {
    setStatus('请输入 ADMIN_API_KEY', true);
    return;
  }

  localStorage.setItem('adminApiKey', key);
  setStatus('加载中...');

  const response = await fetch(`/api/admin/metrics?days=${encodeURIComponent(daysInput.value)}`, {
    headers: {
      'x-admin-key': key
    }
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || '加载失败');
  }

  const { metrics, dailyRevenue } = payload;
  nodes.totalUsers.textContent = number(metrics.totalUsers);
  nodes.todayUsers.textContent = number(metrics.todayUsers);
  nodes.todayRevenue.textContent = money(metrics.todayRevenue, metrics.currency);
  nodes.totalRevenue.textContent = money(metrics.totalRevenue, metrics.currency);
  nodes.updatedAt.textContent = `更新时间 ${new Date(metrics.updatedAt).toLocaleString('zh-CN')}`;
  nodes.localDate.textContent = metrics.localDate;

  renderChart(dailyRevenue, metrics.currency);
  renderTable(dailyRevenue, metrics.currency);
  setStatus('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await loadMetrics();
  } catch (error) {
    setStatus(error.message, true);
  }
});

if (adminKeyInput.value) {
  loadMetrics().catch((error) => setStatus(error.message, true));
}
