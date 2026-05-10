const form = document.querySelector('#authForm');
const adminKeyInput = document.querySelector('#adminKey');
const daysInput = document.querySelector('#days');
const statusNode = document.querySelector('#status');
const chart = document.querySelector('#chart');
const rows = document.querySelector('#dailyRows');
const blogForm = document.querySelector('#blogForm');
const blogRows = document.querySelector('#blogRows');
const resetBlogButton = document.querySelector('#resetBlog');
const reloadBlogsButton = document.querySelector('#reloadBlogs');
const userRows = document.querySelector('#userRows');
const userSearchForm = document.querySelector('#userSearchForm');
const reloadUsersButton = document.querySelector('#reloadUsers');

const nodes = {
  totalUsers: document.querySelector('#totalUsers'),
  todayUsers: document.querySelector('#todayUsers'),
  todayRevenue: document.querySelector('#todayRevenue'),
  totalRevenue: document.querySelector('#totalRevenue'),
  updatedAt: document.querySelector('#updatedAt'),
  localDate: document.querySelector('#localDate'),
  blogCount: document.querySelector('#blogCount'),
  blogId: document.querySelector('#blogId'),
  blogTitle: document.querySelector('#blogTitle'),
  blogSlug: document.querySelector('#blogSlug'),
  blogAuthor: document.querySelector('#blogAuthor'),
  blogStatus: document.querySelector('#blogStatus'),
  blogCover: document.querySelector('#blogCover'),
  blogExcerpt: document.querySelector('#blogExcerpt'),
  blogContent: document.querySelector('#blogContent'),
  userSearch: document.querySelector('#userSearch')
};

let blogs = [];
let users = [];
adminKeyInput.value = localStorage.getItem('adminApiKey') || '';

function adminHeaders() {
  const key = adminKeyInput.value.trim();
  if (!key) throw new Error('ADMIN_API_KEY is required');
  localStorage.setItem('adminApiKey', key);
  return {
    'content-type': 'application/json',
    'x-admin-key': key
  };
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', isError);
}

function money(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format((Number(amount) || 0) / 100);
}

function number(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortId(value) {
  if (!value) return '-';
  const text = String(value);
  return text.length > 12 ? `${text.slice(0, 8)}...` : text;
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString('en-US') : '-';
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
    bar.dataset.label = `${item.date} - ${money(item.revenue, currency)} - ${number(item.paymentsCount)} payments`;
    chart.appendChild(bar);
  }
}

function renderTable(items, currency) {
  rows.innerHTML = '';

  for (const item of [...items].reverse()) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.date}</td>
      <td>${money(item.revenue, currency)}</td>
      <td>${number(item.paymentsCount)}</td>
    `;
    rows.appendChild(tr);
  }
}

function resetBlogForm() {
  blogForm.reset();
  nodes.blogId.value = '';
  nodes.blogStatus.value = 'draft';
}

function fillBlogForm(blog) {
  nodes.blogId.value = blog.id;
  nodes.blogTitle.value = blog.title || '';
  nodes.blogSlug.value = blog.slug || '';
  nodes.blogAuthor.value = blog.authorName || '';
  nodes.blogStatus.value = blog.status || 'draft';
  nodes.blogCover.value = blog.coverImageUrl || '';
  nodes.blogExcerpt.value = blog.excerpt || '';
  nodes.blogContent.value = blog.content || '';
  window.scrollTo({ top: blogForm.offsetTop - 24, behavior: 'smooth' });
}

function renderBlogs() {
  blogRows.innerHTML = '';
  nodes.blogCount.textContent = `${blogs.length} posts`;

  if (!blogs.length) {
    const empty = document.createElement('tr');
    empty.innerHTML = '<td colspan="4">No blog posts</td>';
    blogRows.appendChild(empty);
    return;
  }

  for (const blog of blogs) {
    const tr = document.createElement('tr');
    const published = blog.publishedAt ? new Date(blog.publishedAt).toLocaleDateString('en-US') : '-';
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(blog.title)}</strong>
        <span class="rowHint">/${escapeHtml(blog.slug)}</span>
      </td>
      <td><span class="tag ${escapeHtml(blog.status)}">${escapeHtml(blog.status)}</span></td>
      <td>${published}</td>
      <td><button type="button" class="smallButton" data-edit="${blog.id}">Edit</button></td>
    `;
    blogRows.appendChild(tr);
  }
}

function renderUsers() {
  userRows.innerHTML = '';

  if (!users.length) {
    const empty = document.createElement('tr');
    empty.innerHTML = '<td colspan="4">No users</td>';
    userRows.appendChild(empty);
    return;
  }

  for (const user of users) {
    const label = user.email || user.name || user.anonymousId || user.userId;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(label)}</strong>
        <span class="rowHint">${user.isAnonymous ? 'Anonymous' : 'Registered'} · ${escapeHtml(shortId(user.userId))}</span>
      </td>
      <td>${dateTime(user.createdAt)}</td>
      <td><strong>${number(user.creditsBalance)}</strong></td>
      <td>
        <div class="creditTools">
          <input type="number" min="1" step="1" value="10" data-credit-amount="${user.userId}" aria-label="Credit amount">
          <button type="button" class="smallButton" data-credit-action="add" data-user-id="${user.userId}">Add</button>
          <button type="button" class="smallButton secondary" data-credit-action="deduct" data-user-id="${user.userId}">Deduct</button>
        </div>
      </td>
    `;
    userRows.appendChild(tr);
  }
}

async function loadMetrics() {
  const response = await fetch(`/api/admin/metrics?days=${encodeURIComponent(daysInput.value)}`, {
    headers: adminHeaders()
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Metrics load failed');

  const { metrics, dailyRevenue } = payload;
  nodes.totalUsers.textContent = number(metrics.totalUsers);
  nodes.todayUsers.textContent = number(metrics.todayUsers);
  nodes.todayRevenue.textContent = money(metrics.todayRevenue, metrics.currency);
  nodes.totalRevenue.textContent = money(metrics.totalRevenue, metrics.currency);
  nodes.updatedAt.textContent = `Updated ${new Date(metrics.updatedAt).toLocaleString('en-US')}`;
  nodes.localDate.textContent = metrics.localDate;

  renderChart(dailyRevenue, metrics.currency);
  renderTable(dailyRevenue, metrics.currency);
}

async function loadBlogs() {
  const response = await fetch('/api/admin/blogs?limit=50', {
    headers: adminHeaders()
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Blog load failed');

  blogs = payload.blogs || [];
  renderBlogs();
}

async function loadUsers() {
  const search = nodes.userSearch.value.trim();
  const response = await fetch(`/api/admin/users?limit=50&search=${encodeURIComponent(search)}`, {
    headers: adminHeaders()
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Users load failed');

  users = payload.users || [];
  renderUsers();
}

async function refreshAll() {
  setStatus('Loading...');
  await Promise.all([loadMetrics(), loadBlogs(), loadUsers()]);
  setStatus('');
}

async function saveBlog() {
  const id = nodes.blogId.value;
  const body = {
    title: nodes.blogTitle.value,
    slug: nodes.blogSlug.value || slugify(nodes.blogTitle.value),
    authorName: nodes.blogAuthor.value,
    status: nodes.blogStatus.value,
    coverImageUrl: nodes.blogCover.value,
    excerpt: nodes.blogExcerpt.value,
    content: nodes.blogContent.value
  };

  const response = await fetch(id ? `/api/admin/blogs/${encodeURIComponent(id)}` : '/api/admin/blogs', {
    method: id ? 'PATCH' : 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Blog save failed');

  resetBlogForm();
  await loadBlogs();
  setStatus('Blog saved');
}

async function adjustCredits(userId, action, amount) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/credits/${action}`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      amount,
      reason: 'Admin adjustment'
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Credit adjustment failed');

  await loadUsers();
  setStatus(`Credits updated: ${number(payload.credits.creditsBalance)}`);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await refreshAll();
  } catch (error) {
    setStatus(error.message, true);
  }
});

blogForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await saveBlog();
  } catch (error) {
    setStatus(error.message, true);
  }
});

blogRows.addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit]');
  if (!button) return;
  const blog = blogs.find((item) => item.id === button.dataset.edit);
  if (blog) fillBlogForm(blog);
});

userRows.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-credit-action]');
  if (!button) return;

  const userId = button.dataset.userId;
  const action = button.dataset.creditAction;
  const input = userRows.querySelector(`[data-credit-amount="${CSS.escape(userId)}"]`);
  const amount = Number(input?.value || 0);

  try {
    await adjustCredits(userId, action, amount);
  } catch (error) {
    setStatus(error.message, true);
  }
});

resetBlogButton.addEventListener('click', resetBlogForm);
reloadBlogsButton.addEventListener('click', () => {
  loadBlogs().catch((error) => setStatus(error.message, true));
});
reloadUsersButton.addEventListener('click', () => {
  loadUsers().catch((error) => setStatus(error.message, true));
});
userSearchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadUsers().catch((error) => setStatus(error.message, true));
});

nodes.blogTitle.addEventListener('input', () => {
  if (!nodes.blogId.value) nodes.blogSlug.value = slugify(nodes.blogTitle.value);
});

if (adminKeyInput.value) {
  refreshAll().catch((error) => setStatus(error.message, true));
}
