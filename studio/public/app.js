// Lead Studio — trang quản trị (React + Ant Design bản UMD, viết bằng htm nên không cần build).
// KHÔNG có chức năng gửi tin: bạn tự copy SĐT / tin nhắn / ảnh và tự gửi qua Zalo.
const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } = React;
const html = htm.bind(React.createElement);
const A = antd;
const I = icons;
const { Text, Title, Paragraph, Link } = A.Typography;

// ---------------------------------------------------------------- tiện ích
async function api(url, opt = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
const num = (v) => (v == null ? null : Number(v));
const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('vi-VN'));
const ago = (t) => (t ? dayjs(t).format('DD/MM/YY HH:mm') : '—');
const shotUrl = (r, f) => `/shots/${r.id}/${f}?v=${r.shots_v || ''}`;
async function copyText(text) { await navigator.clipboard.writeText(text); }
async function copyImage(url) {
  const blob = await (await fetch(url, { cache: 'no-store' })).blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
}

const DEMO_STATUS = {
  generating: { label: 'Đang tạo', color: 'processing' },
  draft: { label: 'Chờ duyệt', color: 'gold' },
  approved: { label: 'Đã duyệt', color: 'blue' },
  sent: { label: 'Đã gửi', color: 'green' },
  failed: { label: 'Lỗi', color: 'red' },
  skipped: { label: 'Bỏ qua', color: 'default' },
};
const QUEUE_STATUS = {
  pending: { label: 'Chờ tạo', color: 'default', icon: I.ClockCircleOutlined },
  running: { label: 'Đang tạo', color: 'processing', icon: I.SyncOutlined },
  done: { label: 'Xong', color: 'success', icon: I.CheckCircleOutlined },
  failed: { label: 'Lỗi', color: 'error', icon: I.CloseCircleOutlined },
  cancelled: { label: 'Đã huỷ', color: 'default', icon: I.StopOutlined },
};
const SECTION_VI = { modal: 'Hộp thoại', header: 'Header', hero: 'Mở đầu', trust: 'Cam kết', services: 'Dịch vụ', about: 'Giới thiệu', team: 'Đội ngũ', gallery: 'Hình ảnh', process: 'Quy trình', pricing: 'Bảng giá', testimonials: 'Đánh giá', faq: 'Hỏi đáp', contact: 'Liên hệ', cta: 'Kêu gọi', footer: 'Footer' };
const VIEW_VI = { page: 'Trang', section: 'Section', modal: 'Hộp thoại' };
// Kết quả kiểm tra website (workflow n8n 02): "<loại>: <chi tiết>"
const WEB_ISSUE = {
  dns: { label: 'Tên miền không còn', color: 'red' },
  timeout: { label: 'Web không phản hồi', color: 'red' },
  server: { label: 'Web lỗi server', color: 'red' },
  ssl: { label: 'Lỗi SSL', color: 'red' },
  parked: { label: 'Tên miền rao bán', color: 'red' },
  http: { label: 'Web lỗi', color: 'red' },
  error: { label: 'Web lỗi', color: 'red' },
  blocked: { label: 'Chặn kiểm tra tự động', color: 'default', tip: 'Web chặn truy cập tự động (bot) nên chưa kiểm tra được — có thể vẫn sống, hãy tự mở thử.' },
  js: { label: 'Chưa kiểm tra được', color: 'default', tip: 'Trang gần như không có HTML (dựng bằng JS hoặc chuyển hướng) — hãy tự mở thử.' },
};
const webIssue = (r) => { const k = String(r.web_issue || '').split(':')[0]; return WEB_ISSUE[k] ? { ...WEB_ISSUE[k], detail: r.web_issue } : (r.web_reachable === false ? { label: 'Web lỗi', color: 'red', detail: r.web_issue } : null); };
const scoreColor = (v, thr = 80) => (v == null ? undefined : v >= thr ? '#52c41a' : v >= 60 ? '#faad14' : '#ff4d4f');

// ảnh theo tab và theo màn hình (bản cũ có thêm tab 'generic'; bản mới chỉ có 'llm')
const trackOf = (x) => x.track || 'generic';
const TRACKS = [{ value: 'llm', label: 'LLM tự thiết kế' }, { value: 'generic', label: 'Template generic' }];
const tracksOf = (r) => TRACKS.filter((t) => (r.shots || []).some((x) => trackOf(x) === t.value));
function pagesOf(r, tk) {
  const m = new Map();
  for (const x of r.shots || []) {
    if (trackOf(x) !== tk) continue;
    if (!m.has(x.page)) m.set(x.page, { slug: x.page, title: x.title, view: x.view || 'page', shots: [] });
    m.get(x.page).shots.push(x);
  }
  return [...m.values()];
}
const mainTrack = (r) => (tracksOf(r)[0] || TRACKS[1]).value;
const thumbShot = (r) => { const s = (r.shots || []).filter((x) => trackOf(x) === mainTrack(r)); return s.find((x) => x.kind === 'mobile') || s[0]; };
// Ảnh nên gửi qua Zalo: mở đầu trang chủ + trang chủ trên điện thoại + ảnh chính của từng màn hình còn lại
function suggestedShots(r) {
  const out = [];
  pagesOf(r, mainTrack(r)).forEach((p, i) => {
    if (i === 0) {
      const hero = p.shots.find((x) => x.kind === 'section' && /hero/.test(x.section || ''));
      if (hero) out.push({ ...hero, why: 'Trang chủ' });
      const m = p.shots.find((x) => x.kind === 'mobile'); if (m) out.push({ ...m, why: 'Trang chủ (điện thoại)' });
    } else {
      const main = p.view === 'modal' ? p.shots.find((x) => x.kind === 'full') : (p.shots.find((x) => x.kind === 'section') || p.shots.find((x) => x.kind === 'full'));
      if (main) out.push({ ...main, why: p.title });
    }
  });
  return out.slice(0, 5);
}

// ---------------------------------------------------------------- trạng thái chung (poll im lặng)
const Ctx = createContext(null);
const useStudio = () => useContext(Ctx);

function useStatusPoll() {
  const [status, setStatus] = useState(null);
  const timer = useRef(null);
  const run = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const s = await api('/api/status');
      setStatus(s);
      timer.current = setTimeout(run, s.job.busy ? 3000 : 15000);
    } catch { timer.current = setTimeout(run, 10000); }
  }, []);
  useEffect(() => { run(); const f = () => document.visibilityState === 'visible' && run(); document.addEventListener('visibilitychange', f); return () => { clearTimeout(timer.current); document.removeEventListener('visibilitychange', f); }; }, [run]);
  return [status, run];
}

// Đường dẫn dạng #/trang/tham-so → ['trang', 'tham-so', ...]
function useHash() {
  const get = () => (location.hash || '#/leads').slice(2).split('?')[0].split('/').map(decodeURIComponent);
  const [h, setH] = useState(get);
  useEffect(() => { const f = () => setH(get()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
}

// ---------------------------------------------------------------- khung trang
function Shell() {
  const [status, refreshStatus] = useStatusPoll();
  const route = useHash();
  const page = route[0] || 'leads';
  const [drawerId, setDrawerId] = useState(null);
  useEffect(() => { setDrawerId(null); }, [route.join('/')]); // đổi trang → đóng khung chi tiết
  const job = status?.job;
  // "phiên bản dữ liệu": đổi khi hàng đợi chạy xong 1 lead hoặc số bản demo đổi → các trang tự tải lại im lặng
  const version = status ? [job.done, job.failed, job.busy, ...Object.values(status.counts)].join('.') : '';
  const c = status?.counts || {};
  const items = [
    { key: 'leads', icon: html`<${I.TeamOutlined} />`, label: 'Lead đã crawl' },
    { key: 'demos', icon: html`<${I.AppstoreOutlined} />`, label: html`<span>Duyệt demo ${c.draft ? html`<${A.Badge} count=${c.draft} size="small" style=${{ marginLeft: 6 }} />` : null}</span>` },
    { key: 'send', icon: html`<${I.SendOutlined} />`, label: html`<span>Gửi tin ${c.approved ? html`<${A.Badge} count=${c.approved} size="small" color="#1677ff" style=${{ marginLeft: 6 }} />` : null}</span>` },
    { key: 'sent', icon: html`<${I.CheckCircleOutlined} />`, label: html`<span>Đã gửi ${c.followups_due ? html`<${A.Tooltip} title="Đến hạn gọi lại"><${A.Badge} count=${c.followups_due} size="small" style=${{ marginLeft: 6 }} /><//>` : null}</span>` },
    { key: 'settings', icon: html`<${I.SettingOutlined} />`, label: 'Cài đặt' },
  ];
  const titles = { leads: 'Lead đã crawl', demos: 'Duyệt demo', send: 'Gửi tin', sent: 'Đã gửi · theo dõi khách', settings: 'Cài đặt', demo: `Chi tiết demo #${route[1] || ''}`, edit: 'Sửa màn hình' };
  const ctx = { status, refreshStatus, version, openDemo: setDrawerId, route };
  const Page = { leads: LeadsPage, demos: DemosPage, send: SendPage, settings: SettingsPage, sent: SentPage, demo: DemoPage, edit: EditorPage }[page] || LeadsPage;
  const menuKey = { demo: 'demos', edit: 'demos' }[page] || page;
  return html`<${Ctx.Provider} value=${ctx}>
    <${A.Layout} style=${{ minHeight: '100vh' }}>
      <${A.Layout.Sider} theme="light" width=${232} breakpoint="lg" collapsedWidth=${72}
        style=${{ borderRight: '1px solid #f0f0f0', position: 'sticky', top: 0, height: '100vh' }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 20px 16px' }}>
          <div style=${{ width: 34, height: 34, borderRadius: 10, background: '#1677ff', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><${I.ThunderboltFilled} /></div>
          <div style=${{ overflow: 'hidden', whiteSpace: 'nowrap' }}><div style=${{ fontWeight: 600 }}>Lead Studio</div><${Text} type="secondary" style=${{ fontSize: 12 }}>Demo & tin nhắn</${Text}></div>
        </div>
        <${A.Menu} mode="inline" selectedKeys=${[menuKey]} items=${items} style=${{ borderInlineEnd: 0 }}
          onClick=${(e) => { location.hash = `#/${e.key}`; }} />
      <//>
      <${A.Layout}>
        <${A.Layout.Header} style=${{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 10, height: 60 }}>
          ${['demo', 'edit'].includes(page) && html`<${A.Button} type="text" icon=${html`<${I.ArrowLeftOutlined} />`} onClick=${() => (history.length > 1 ? history.back() : (location.hash = '#/demos'))} />`}
          <${Title} level=${4} style=${{ margin: 0, flex: 1 }}>${titles[page] || ''}</${Title}>
          ${status && html`<${A.Space} size=${12}>
            ${status.llm_configured
              ? html`<${A.Tooltip} title="Model LLM đang dùng"><${A.Tag} icon=${html`<${I.RobotOutlined} />`} color="blue">${status.model}</${A.Tag}><//>`
              : html`<${A.Tag} color="red">Chưa cấu hình LLM</${A.Tag}>`}
            <${A.Tooltip} title="Tổng token LLM đã dùng (vào / ra)"><${Text} type="secondary" style=${{ fontSize: 12 }}>${fmt(c.tokens_in)} / ${fmt(c.tokens_out)} token</${Text}><//>
            <${QueueButton} />
          <//>`}
        <//>
        <${A.Layout.Content} style=${{ padding: page === 'edit' ? 0 : 24 }}>
          ${status ? html`<${Page} key=${route.join('/')} />` : html`<${A.Skeleton} active />`}
        <//>
      <//>
    <//>
    ${drawerId && html`<${DemoDrawer} id=${drawerId} onClose=${() => setDrawerId(null)} />`}
  <//>`;
}

// ---------------------------------------------------------------- hàng đợi tạo demo
function QueueButton() {
  const { status, refreshStatus, openDemo } = useStudio();
  const { message } = A.App.useApp();
  const job = status.job;
  const q = job.queue || [];
  const active = q.filter((x) => ['pending', 'running'].includes(x.status)).length;
  const cancel = async (id) => { try { await api(`/api/queue/${id}`, { method: 'DELETE' }); refreshStatus(); } catch (e) { message.error(e.message); } };
  const content = html`<div style=${{ width: 380, maxHeight: 420, overflow: 'auto' }}>
    ${job.total > 0 && html`<${A.Progress} percent=${Math.round(((job.done + job.failed) / Math.max(job.total, 1)) * 100)}
      format=${() => `${job.done + job.failed}/${job.total}`} status=${job.busy ? 'active' : job.failed ? 'exception' : 'success'} size="small" />`}
    ${q.length ? html`<${A.List} size="small" dataSource=${[...q].reverse()} renderItem=${(x) => {
      const s = QUEUE_STATUS[x.status] || QUEUE_STATUS.pending;
      return html`<${A.List.Item} key=${x.id} actions=${[
        x.status === 'pending' && html`<${A.Button} size="small" type="text" danger onClick=${() => cancel(x.id)}>Huỷ<//>`,
        x.status === 'done' && x.outreach_id && html`<${A.Button} size="small" type="link" onClick=${() => openDemo(x.outreach_id)}>Xem<//>`,
      ].filter(Boolean)}>
        <${A.List.Item.Meta} avatar=${html`<${s.icon} spin=${x.status === 'running'} style=${{ color: x.status === 'failed' ? '#ff4d4f' : x.status === 'done' ? '#52c41a' : '#1677ff' }} />`}
          title=${html`<${Text} ellipsis style=${{ maxWidth: 230 }}>${x.name}</${Text}>`}
          description=${x.error ? html`<${Text} type="danger" style=${{ fontSize: 12 }}>${x.error}</${Text}>` : s.label} />
      <//>`;
    }} />` : html`<${A.Empty} image=${A.Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lead nào trong hàng đợi. Chọn lead ở trang Lead rồi bấm Tạo demo." />`}
  </div>`;
  return html`<${A.Popover} trigger="click" placement="bottomRight" title="Hàng đợi tạo demo" content=${content}>
    <${A.Button} icon=${html`<${job.busy ? I.LoadingOutlined : I.UnorderedListOutlined} />`} type=${job.busy ? 'primary' : 'default'}>
      ${job.busy ? `Đang tạo ${job.running || 0} lead · xong ${job.done + job.failed}/${job.total}` : 'Hàng đợi'}
      ${active > 0 && !job.busy ? html`<${A.Badge} count=${active} size="small" style=${{ marginLeft: 6 }} />` : null}
    <//>
  <//>`;
}

// ---------------------------------------------------------------- trang: Lead đã crawl
const DEFAULT_FILTERS = { q: '', industry: [], area: [], website: [], status: [], demo: '', min_score: null, phone: false };
function LeadsPage() {
  const { status, version, refreshStatus, openDemo } = useStudio();
  const { message, modal } = A.App.useApp();
  const [facets, setFacets] = useState(null);
  const [filters, setFilters] = useState(() => { try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem('leadFilters') || '{}') }; } catch { return DEFAULT_FILTERS; } });
  const [sort, setSort] = useState({ sort: 'created', order: 'desc' });
  const [page, setPage] = useState({ page: 1, pageSize: 50 });
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Map()); // id → row (giữ khi đổi trang)
  const [q, setQ] = useState(filters.q);

  useEffect(() => { api('/api/leads/facets').then(setFacets).catch(() => {}); }, []);
  useEffect(() => { try { localStorage.setItem('leadFilters', JSON.stringify(filters)); } catch {} }, [filters]);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    const p = new URLSearchParams({ ...sort, ...page });
    for (const [k, v] of Object.entries(filters)) {
      if (Array.isArray(v) ? v.length : v) p.set(k, Array.isArray(v) ? v.join(',') : k === 'phone' ? '1' : v);
    }
    try { setData(await api(`/api/leads?${p}`)); } catch (e) { message.error(e.message); } finally { setLoading(false); }
  }, [filters, sort, page]);
  useEffect(() => { load(false); }, [load]);
  useEffect(() => { if (version) load(true); }, [version]);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage((p) => ({ ...p, page: 1 })); };
  const queueOf = useMemo(() => new Map((status.job.queue || []).filter((x) => ['pending', 'running'].includes(x.status)).map((x) => [String(x.id), x])), [status]);
  const opts = (k) => (facets?.[k] || []).map((x) => ({ value: x.v, label: `${x.v} (${x.n})` }));
  const statusOpts = (facets?.status || []).map((x) => { const [label, v] = x.v.split('|'); return { value: v, label: `${label} (${x.n})` }; });
  const activeFilters = Object.entries(filters).filter(([k, v]) => (Array.isArray(v) ? v.length : v)).length;

  const generate = (ids, rows) => {
    const hasDemo = rows.filter((r) => r.demo_id && r.demo_status !== 'failed').length;
    modal.confirm({
      title: `Tạo demo cho ${ids.length} lead?`,
      width: 560,
      icon: html`<${I.ThunderboltOutlined} style=${{ color: '#1677ff' }} />`,
      content: html`<div>
        <${A.List} size="small" bordered style=${{ maxHeight: 260, overflow: 'auto', margin: '12px 0' }} dataSource=${rows}
          renderItem=${(r) => html`<${A.List.Item}><${Text} ellipsis style=${{ maxWidth: 330 }}>${r.name}</${Text}><${A.Tag} color=${scoreColor(r.score)}>${r.score} điểm</${A.Tag}><//>`} />
        <${Text} type="secondary" style=${{ fontSize: 13 }}>
          Chạy lần lượt, mỗi lead khoảng 3–8 phút và 60–110k token. Theo dõi ở nút "Hàng đợi" trên đầu trang.
          ${hasDemo ? ` ${hasDemo} lead đã có demo — bản cũ sẽ được thay bằng bản mới.` : ''}
        </${Text}>
      </div>`,
      okText: 'Tạo demo', cancelText: 'Huỷ',
      onOk: async () => {
        try {
          const r = await api('/api/generate-batch', { method: 'POST', body: { ids: ids.map(Number) } });
          message.success(`Đã thêm ${r.added} lead vào hàng đợi`);
          setSelected(new Map()); refreshStatus(); load(true);
        } catch (e) { message.error(e.message); }
      },
    });
  };

  const columns = [
    { title: 'Lead', dataIndex: 'name', key: 'name', sorter: true, width: 320, render: (_, r) => html`<div style=${{ minWidth: 260 }}>
        <${Text} strong>${r.name}</${Text}>
        <div><${Text} type="secondary" style=${{ fontSize: 12 }}>${[r.industry, r.area].filter(Boolean).join(' · ')}</${Text}></div>
        <${A.Space} size=${10} style=${{ marginTop: 2 }}>
          ${r.maps_url && html`<${A.Tooltip} title="Google Maps"><a href=${r.maps_url} target="_blank" onClick=${(e) => e.stopPropagation()}><${I.EnvironmentOutlined} /></a><//>`}
          ${r.website_url && html`<${A.Tooltip} title=${r.website_url}><a href=${r.website_url} target="_blank" onClick=${(e) => e.stopPropagation()}><${I.GlobalOutlined} /></a><//>`}
          ${r.facebook_url && html`<${A.Tooltip} title="Fanpage"><a href=${r.facebook_url} target="_blank" onClick=${(e) => e.stopPropagation()}><${I.FacebookOutlined} /></a><//>`}
        <//>
      </div>` },
    { title: 'Điểm', dataIndex: 'score', key: 'score', sorter: true, width: 90, render: (v, r) => html`<${A.Tooltip} title=${r.score_reasons}>
        <${A.Tag} color=${v >= 80 ? 'green' : v >= 60 ? 'gold' : 'default'} style=${{ fontWeight: 600 }}>${v}</${A.Tag}><//>` },
    { title: 'Website', key: 'web', width: 200, render: (_, r) => html`<${A.Space} size=${[4, 4]} wrap>
        <${A.Tag}>${r.website_label || '—'}</${A.Tag}>
        ${(() => { const w = webIssue(r); return w && html`<${A.Tooltip} title=${w.tip ? `${w.tip} (${w.detail})` : w.detail}><${A.Tag} color=${w.color}>${w.label}</${A.Tag}><//>`; })()}
        ${r.website_url && r.has_ssl === false && !String(r.web_issue || '').startsWith('ssl') && html`<${A.Tag} color="orange">Không SSL</${A.Tag}>`}
        ${r.website_url && r.web_reachable && r.is_mobile_friendly === false && html`<${A.Tag} color="orange">Lỗi mobile</${A.Tag}>`}
      <//>` },
    { title: 'Google', key: 'reviews', sorter: true, width: 120, render: (_, r) => (r.rating
      ? html`<span><${I.StarFilled} style=${{ color: '#fadb14' }} /> ${Number(r.rating).toLocaleString('vi-VN')} <${Text} type="secondary">(${fmt(r.review_count)})</${Text}></span>`
      : html`<${Text} type="secondary">${r.review_count ? `${fmt(r.review_count)} review` : '—'}</${Text}>`) },
    { title: 'SĐT', dataIndex: 'phone', key: 'phone', width: 140, render: (v) => (v ? html`<${Text} copyable=${{ tooltips: ['Copy', 'Đã copy'] }} style=${{ fontVariantNumeric: 'tabular-nums' }}>${v}</${Text}>` : html`<${Text} type="secondary">—</${Text}>`) },
    { title: 'Trạng thái', dataIndex: 'status_label', key: 'status', width: 120, render: (v) => html`<${A.Tag} bordered=${false}>${v}</${A.Tag}>` },
    { title: 'Demo', key: 'demo', width: 150, render: (_, r) => {
      const qi = queueOf.get(String(r.id));
      if (qi) { const s = QUEUE_STATUS[qi.status]; return html`<${A.Tag} icon=${html`<${s.icon} spin=${qi.status === 'running'} />`} color=${s.color}>${s.label}</${A.Tag}>`; }
      if (!r.demo_id) return html`<${Text} type="secondary">Chưa có</${Text}>`;
      const s = DEMO_STATUS[r.demo_status] || { label: r.demo_status };
      return html`<${A.Button} size="small" type="link" style=${{ padding: 0 }} onClick=${(e) => { e.stopPropagation(); openDemo(r.demo_id); }}>
        <${A.Tag} color=${s.color}>${s.label}</${A.Tag}>${r.demo_confidence != null ? html`<span style=${{ color: scoreColor(r.demo_confidence, status.ready_threshold) }}>${r.demo_confidence}</span>` : null}<//>`;
    } },
    { title: 'Ngày thêm', dataIndex: 'first_seen_at', key: 'created', sorter: true, width: 130, defaultSortOrder: 'descend', render: (v) => html`<${Text} type="secondary" style=${{ fontSize: 12 }}>${ago(v)}</${Text}>` },
  ];

  const selIds = [...selected.keys()];
  return html`<${A.Space} direction="vertical" size=${16} style=${{ width: '100%' }}>
    <${A.Card} size="small" styles=${{ body: { padding: 16 } }}>
      <${A.Flex} gap=${12} wrap="wrap" align="center">
        <${A.Input.Search} placeholder="Tìm tên, SĐT, website, khu vực…" allowClear style=${{ width: 280 }} value=${q}
          onChange=${(e) => setQ(e.target.value)} onSearch=${(v) => setF('q', v)} />
        <${A.Select} mode="multiple" allowClear maxTagCount="responsive" placeholder="Ngành" style=${{ minWidth: 200 }} options=${opts('industry')} value=${filters.industry} onChange=${(v) => setF('industry', v)} />
        <${A.Select} mode="multiple" allowClear maxTagCount="responsive" placeholder="Khu vực" style=${{ minWidth: 170 }} options=${opts('area')} value=${filters.area} onChange=${(v) => setF('area', v)} />
        <${A.Select} mode="multiple" allowClear maxTagCount="responsive" placeholder="Website" style=${{ minWidth: 190 }} options=${opts('website')} value=${filters.website} onChange=${(v) => setF('website', v)} />
        <${A.Select} mode="multiple" allowClear maxTagCount="responsive" placeholder="Trạng thái lead" style=${{ minWidth: 170 }} options=${statusOpts} value=${filters.status} onChange=${(v) => setF('status', v)} />
        <${A.Select} allowClear placeholder="Demo" style=${{ width: 160 }} value=${filters.demo || undefined} onChange=${(v) => setF('demo', v || '')}
          options=${[{ value: 'none', label: 'Chưa có demo' }, { value: 'has', label: 'Đã có demo' }, ...['draft', 'approved', 'sent', 'failed'].map((k) => ({ value: k, label: `Demo: ${DEMO_STATUS[k].label}` }))]} />
        <${A.InputNumber} placeholder="Điểm từ" min=${0} max=${100} style=${{ width: 110 }} value=${filters.min_score} onChange=${(v) => setF('min_score', v)} />
        <${A.Checkbox} checked=${filters.phone} onChange=${(e) => setF('phone', e.target.checked)}>Có SĐT</${A.Checkbox}>
        ${activeFilters > 0 && html`<${A.Button} type="link" onClick=${() => { setFilters(DEFAULT_FILTERS); setQ(''); setPage((p) => ({ ...p, page: 1 })); }}>Xoá lọc (${activeFilters})<//>`}
      <//>
    <//>

    <${A.Card} size="small" styles=${{ body: { padding: 0 } }}
      title=${html`<${A.Space}><span>${fmt(data.total)} lead</span>${status.eligible ? html`<${Text} type="secondary" style=${{ fontWeight: 400, fontSize: 13 }}>· ${status.eligible} lead đủ điểm chưa có demo</${Text}>` : null}<//>`}
      extra=${html`<${A.Space}>
        ${selIds.length > 0 && html`<${A.Button} onClick=${() => setSelected(new Map())}>Bỏ chọn<//>`}
        <${A.Button} type="primary" icon=${html`<${I.ThunderboltOutlined} />`} disabled=${!selIds.length || !status.llm_configured}
          onClick=${() => generate(selIds, [...selected.values()])}>${selIds.length ? `Tạo demo cho ${selIds.length} lead` : 'Chọn lead để tạo demo'}<//>
      <//>`}>
      <${A.Table} rowKey=${(r) => String(r.id)} size="middle" loading=${loading} columns=${columns} dataSource=${data.rows}
        scroll=${{ x: 1100 }}
        rowSelection=${{
          selectedRowKeys: selIds, preserveSelectedRowKeys: true,
          onChange: (keys, rows) => setSelected((old) => { const m = new Map(); for (const k of keys) m.set(k, rows.find((r) => r && String(r.id) === k) || old.get(k)); return m; }),
          getCheckboxProps: (r) => ({ disabled: queueOf.has(String(r.id)) }),
        }}
        pagination=${{ current: page.page, pageSize: page.pageSize, total: data.total, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (t) => `${fmt(t)} lead` }}
        onChange=${(pg, _f, sorter) => {
          setPage({ page: pg.current, pageSize: pg.pageSize });
          setSort(sorter.order ? { sort: sorter.columnKey, order: sorter.order === 'ascend' ? 'asc' : 'desc' } : { sort: 'created', order: 'desc' });
        }} />
    <//>
  <//>`;
}

// ---------------------------------------------------------------- trang: Duyệt demo
const DEMO_TABS = [
  { key: 'draft', label: 'Chờ duyệt', statuses: 'draft' },
  { key: 'approved', label: 'Đã duyệt', statuses: 'approved' },
  { key: 'sent', label: 'Đã gửi', statuses: 'sent' },
  { key: 'failed', label: 'Lỗi / đang tạo', statuses: 'failed,generating' },
  { key: 'skipped', label: 'Bỏ qua', statuses: 'skipped' },
];
function useOutreach(statuses) {
  const { version } = useStudio();
  const { message } = A.App.useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try { setRows(await api(`/api/outreach?status=${statuses}`)); } catch (e) { message.error(e.message); } finally { setLoading(false); }
  }, [statuses]);
  useEffect(() => { load(false); }, [load]);
  useEffect(() => { if (version) load(true); }, [version]);
  return [rows, loading, load];
}

function DemosPage() {
  const { status, openDemo, refreshStatus } = useStudio();
  const { message } = A.App.useApp();
  const [tab, setTab] = useState('draft');
  const t = DEMO_TABS.find((x) => x.key === tab);
  const [rows, loading, reload] = useOutreach(t.statuses);
  const [q, setQ] = useState('');
  const [readyOnly, setReadyOnly] = useState(false);
  const [sel, setSel] = useState([]);
  const thr = status.ready_threshold;
  const c = status.counts;
  const shown = rows.filter((r) => (!q || `${r.name} ${r.industry} ${r.area} ${r.phone}`.toLowerCase().includes(q.toLowerCase()))
    && (!readyOnly || (r.confidence ?? 0) >= thr));
  const bulk = async (st) => {
    try { const r = await api('/api/outreach/bulk', { method: 'POST', body: { ids: sel.map(Number), status: st } }); message.success(`Đã cập nhật ${r.updated} bản`); setSel([]); reload(true); refreshStatus(); }
    catch (e) { message.error(e.message); }
  };
  const columns = [
    { title: '', key: 'thumb', width: 76, render: (_, r) => { const s = thumbShot(r); return s
      ? html`<img src=${shotUrl(r, s.file)} loading="lazy" style=${{ width: 56, height: 92, objectFit: 'cover', objectPosition: 'top', borderRadius: 6, border: '1px solid #f0f0f0', display: 'block' }} />`
      : html`<div style=${{ width: 56, height: 92, borderRadius: 6, background: '#fafafa', display: 'grid', placeItems: 'center', color: '#bfbfbf' }}>${r.status === 'generating' ? html`<${I.LoadingOutlined} />` : html`<${I.PictureOutlined} />`}</div>`; } },
    { title: 'Lead', key: 'lead', render: (_, r) => html`<div style=${{ minWidth: 200 }}>
        <${Text} strong>${r.name}</${Text}>
        <div><${Text} type="secondary" style=${{ fontSize: 12 }}>${[r.industry, r.area, r.phone].filter(Boolean).join(' · ')}</${Text}></div>
        <${A.Space} size=${4} style=${{ marginTop: 4 }} wrap>
          <${A.Tag} color=${DEMO_STATUS[r.status]?.color}>${DEMO_STATUS[r.status]?.label}</${A.Tag}>
          ${r.old_site_url && html`<${A.Tooltip} title=${r.old_site_url}><${A.Tag} color="purple">Làm mới web cũ</${A.Tag}><//>`}
          ${(r.llm_list || []).length > 0 && html`<${A.Tag}>${r.llm_list.length} màn hình</${A.Tag}>`}
        <//>
      </div>` },
    { title: 'Tin nhắn', dataIndex: 'message', key: 'message', render: (v, r) => (r.status === 'failed'
      ? html`<${Text} type="danger" style=${{ fontSize: 13 }}>${r.error}</${Text}>`
      : html`<${Paragraph} ellipsis=${{ rows: 3 }} style=${{ margin: 0, fontSize: 13, color: '#595959', maxWidth: 460 }}>${v || '—'}</${Paragraph}>`) },
    { title: 'Confident', dataIndex: 'confidence', key: 'conf', width: 110, sorter: (a, b) => (a.confidence ?? -1) - (b.confidence ?? -1),
      render: (v, r) => (v == null ? '—' : html`<${A.Tooltip} title=${`Lead ${r.lead_score} · Tự nhiên ${r.human_score} · Hợp ngành ${r.fit_score}`}>
        <${A.Progress} type="circle" size=${46} percent=${v} strokeColor=${scoreColor(v, thr)} format=${(p) => p} /><//>`) },
    { title: 'Vấn đề', key: 'issues', width: 90, render: (_, r) => { const n = (r.judge_issues || []).length; return n
      ? html`<${A.Tooltip} title=${html`<ul style=${{ paddingLeft: 16, margin: 0 }}>${r.judge_issues.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul>`}><${A.Tag} color="orange">${n} ý</${A.Tag}><//>`
      : html`<${Text} type="secondary">—</${Text}>`; } },
    { title: 'Tạo lúc', dataIndex: 'created_at', key: 'created', width: 120, sorter: (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
      render: (v) => html`<${Text} type="secondary" style=${{ fontSize: 12 }}>${ago(v)}</${Text}>` },
  ];
  const canBulk = ['draft', 'approved'].includes(tab);
  return html`<${A.Card} styles=${{ body: { paddingTop: 4 } }}>
    <${A.Tabs} activeKey=${tab} onChange=${(k) => { setTab(k); setSel([]); }}
      items=${DEMO_TABS.map((x) => ({ key: x.key, label: html`<span>${x.label} <${A.Badge} count=${x.statuses.split(',').reduce((s, k) => s + (c[k] || 0), 0)} showZero color=${x.key === tab ? '#1677ff' : '#d9d9d9'} size="small" /></span>` }))} />
    <${A.Flex} gap=${12} wrap="wrap" align="center" style=${{ marginBottom: 12 }}>
      <${A.Input} prefix=${html`<${I.SearchOutlined} />`} placeholder="Tìm lead…" allowClear style=${{ width: 260 }} value=${q} onChange=${(e) => setQ(e.target.value)} />
      <${A.Checkbox} checked=${readyOnly} onChange=${(e) => setReadyOnly(e.target.checked)}>Chỉ bản sẵn sàng (≥ ${thr})</${A.Checkbox}>
      <span style=${{ flex: 1 }} />
      ${canBulk && sel.length > 0 && html`<${A.Space}>
        <${Text} type="secondary">Đã chọn ${sel.length}</${Text}>
        ${tab === 'draft' && html`<${A.Button} type="primary" icon=${html`<${I.CheckOutlined} />`} onClick=${() => bulk('approved')}>Duyệt<//>`}
        ${tab === 'approved' && html`<${A.Button} icon=${html`<${I.RollbackOutlined} />`} onClick=${() => bulk('draft')}>Về chờ duyệt<//>`}
        <${A.Button} danger onClick=${() => bulk('skipped')}>Bỏ qua<//>
      <//>`}
    <//>
    <${A.Table} rowKey=${(r) => String(r.id)} loading=${loading} columns=${columns} dataSource=${shown} size="middle"
      rowClassName="row-click" onRow=${(r) => ({ onClick: () => openDemo(r.id) })}
      rowSelection=${canBulk ? { selectedRowKeys: sel, onChange: setSel } : undefined}
      pagination=${{ pageSize: 20, showTotal: (n) => `${n} bản`, hideOnSinglePage: true }}
      locale=${{ emptyText: html`<${A.Empty} description=${tab === 'draft' ? 'Chưa có demo chờ duyệt. Vào trang Lead, chọn lead rồi bấm Tạo demo.' : 'Không có bản nào'} />` }} />
  <//>`;
}

// ---------------------------------------------------------------- chi tiết 1 bản demo
function DemoDrawer({ id, onClose }) {
  const { status, refreshStatus, version } = useStudio();
  const { message, modal } = A.App.useApp();
  const [r, setR] = useState(null);
  const [msg, setMsg] = useState('');
  const [saved, setSaved] = useState('');
  const saveTimer = useRef(null);
  const load = useCallback(async () => {
    try { const d = await api(`/api/outreach/${id}`); setR(d); setMsg((m) => (m && d.message !== m && saveTimer.current ? m : d.message || '')); }
    catch (e) { message.error(e.message); onClose(); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (version && r && !saveTimer.current) load(); }, [version]);

  const editable = r && ['draft', 'approved'].includes(r.status);
  const onMsg = (v) => {
    setMsg(v); setSaved('Đang lưu…');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await api(`/api/outreach/${id}`, { method: 'PATCH', body: { message: v } }); setSaved('Đã lưu'); } catch (e) { setSaved(''); message.error(e.message); }
      saveTimer.current = null;
    }, 700);
  };
  const setStatus = async (st) => {
    try { await api(`/api/outreach/${id}`, { method: 'PATCH', body: { status: st } }); message.success({ approved: 'Đã duyệt — xem ở trang Gửi tin', skipped: 'Đã bỏ qua', sent: 'Đã ghi nhận đã gửi', draft: 'Đã chuyển về chờ duyệt' }[st]); refreshStatus(); load(); }
    catch (e) { message.error(e.message); }
  };
  const regen = () => modal.confirm({
    title: 'Tạo lại demo cho lead này?', content: 'Bản hiện tại (kể cả tin nhắn đã sửa) sẽ bị thay bằng bản mới.', okText: 'Tạo lại', cancelText: 'Huỷ',
    onOk: async () => { try { await api(`/api/leads/${r.business_id}/regenerate`, { method: 'POST', body: {} }); message.success('Đã thêm vào hàng đợi'); refreshStatus(); onClose(); } catch (e) { message.error(e.message); } },
  });
  const copy = async (fn, label) => { try { await fn(); message.success(`Đã copy ${label}`); } catch (e) { message.error(`Không copy được: ${e.message}`); } };
  const thr = status.ready_threshold;
  const issues = r?.judge_issues || [];

  const footer = r && html`<${A.Flex} gap=${8} wrap="wrap">
    ${r.phone && html`<${A.Button} icon=${html`<${I.PhoneOutlined} />`} onClick=${() => copy(() => copyText(r.phone), 'SĐT')}>Copy SĐT<//>`}
    ${r.message && html`<${A.Button} icon=${html`<${I.CopyOutlined} />`} onClick=${() => copy(() => copyText(msg), 'tin nhắn')}>Copy tin nhắn<//>`}
    <span style=${{ flex: 1 }} />
    ${r.status !== 'generating' && html`<${A.Button} icon=${html`<${I.ReloadOutlined} />`} onClick=${regen}>Tạo lại<//>`}
    ${editable && html`<${A.Button} danger onClick=${() => setStatus('skipped')}>Bỏ qua<//>`}
    ${r.status === 'approved' && html`<${A.Button} onClick=${() => setStatus('draft')}>Về chờ duyệt<//>`}
    ${r.status === 'draft' && html`<${A.Button} type="primary" icon=${html`<${I.CheckOutlined} />`} onClick=${() => setStatus('approved')}>Duyệt<//>`}
    ${r.status === 'approved' && html`<${A.Button} type="primary" style=${{ background: '#52c41a' }} icon=${html`<${I.SendOutlined} />`} onClick=${() => setStatus('sent')}>Tôi đã gửi<//>`}
  <//>`;

  return html`<${A.Drawer} open width=${Math.min(1280, window.innerWidth - 40)} onClose=${onClose} destroyOnClose footer=${footer}
    title=${r ? html`<div><div>${r.name}</div><${Text} type="secondary" style=${{ fontSize: 12, fontWeight: 400 }}>${[r.industry, r.area, r.website_label, r.rating ? `${r.rating}★ (${fmt(r.review_count)})` : ''].filter(Boolean).join(' · ')}</${Text}></div>` : 'Đang tải…'}
    extra=${r && html`<${A.Space}>${r.old_site_url && html`<${A.Tag} color="purple">Làm mới web cũ</${A.Tag}>`}<${A.Tag} color=${DEMO_STATUS[r.status]?.color}>${DEMO_STATUS[r.status]?.label}</${A.Tag}><//>`}>
    ${!r ? html`<${A.Skeleton} active />` : html`<${A.Row} gutter=${[24, 24]}>
      <${A.Col} xs=${24} xl=${15}>
        ${r.status === 'failed' && html`<${A.Alert} type="error" showIcon message="Tạo demo lỗi" description=${r.error} style=${{ marginBottom: 16 }} />`}
        ${r.status === 'generating' ? html`<${A.Result} icon=${html`<${I.LoadingOutlined} />`} title="Đang tạo demo…" subTitle="Trang tự cập nhật khi xong." />`
          : (r.shots || []).length ? html`<${Gallery} r=${r} copy=${copy} />` : html`<${A.Empty} description="Không có ảnh" />`}
      <//>
      <${A.Col} xs=${24} xl=${9}>
        <${A.Space} direction="vertical" size=${16} style=${{ width: '100%' }}>
          ${r.message != null && html`<${A.Card} size="small" title="Tin nhắn Zalo" className="msg-box"
            extra=${html`<${A.Space}>${saved && html`<${Text} type="secondary" style=${{ fontSize: 12 }}>${saved}</${Text}>`}
              ${editable && msg !== r.message_original && html`<${A.Button} size="small" type="link" onClick=${() => onMsg(r.message_original)}>Khôi phục bản gốc<//>`}<//>`}>
            <${A.Input.TextArea} value=${msg} readOnly=${!editable} autoSize=${{ minRows: 7, maxRows: 16 }} onChange=${(e) => onMsg(e.target.value)} variant="borderless" style=${{ padding: 0 }} />
            <${Text} type="secondary" style=${{ fontSize: 12 }}>${msg.length} ký tự</${Text}>
          <//>`}
          ${r.confidence != null && html`<${A.Card} size="small" title="Chấm điểm">
            <${A.Flex} gap=${20} align="center">
              <${A.Progress} type="dashboard" size=${96} percent=${r.confidence} strokeColor=${scoreColor(r.confidence, thr)} format=${(p) => html`<div><div style=${{ fontSize: 22, fontWeight: 600 }}>${p}</div><div style=${{ fontSize: 11, color: '#8c8c8c' }}>confident</div></div>`} />
              <div style=${{ flex: 1 }}>
                ${[['Điểm lead', r.lead_score], ['Tự nhiên như người viết', r.human_score], ['Demo hợp ngành', r.fit_score]].map(([l, v]) => html`<div key=${l}>
                  <${A.Flex} justify="space-between"><${Text} type="secondary" style=${{ fontSize: 12 }}>${l}</${Text}><${Text} style=${{ fontSize: 12 }}>${v}</${Text}><//>
                  <${A.Progress} percent=${v} showInfo=${false} size="small" strokeColor=${scoreColor(v, thr)} style=${{ margin: 0 }} />
                </div>`)}
              </div>
            <//>
            ${issues.length > 0 && html`<${A.Alert} type="warning" style=${{ marginTop: 12 }} message=${html`<ul style=${{ margin: 0, paddingLeft: 18 }}>${issues.map((x, i) => html`<li key=${i} style=${{ fontSize: 13 }}>${x}</li>`)}</ul>`} />`}
          <//>`}
          <${A.Card} size="small" title="Thông tin lead">
            <${A.Descriptions} column=${1} size="small" items=${[
              { label: 'SĐT', children: r.phone ? html`<${Text} copyable strong>${r.phone}</${Text}>` : '—' },
              { label: 'Điểm', children: r.score },
              { label: 'Lý do', children: r.score_reasons || '—' },
              { label: 'Website', children: r.website_url ? html`<a href=${r.website_url} target="_blank">${r.website_url}</a>` : r.website_label || '—' },
              { label: 'Liên kết', children: html`<${A.Space}>${r.maps_url && html`<a href=${r.maps_url} target="_blank">Google Maps</a>`}${r.facebook_url && html`<a href=${r.facebook_url} target="_blank">Fanpage</a>`}<//>` },
              { label: 'Token', children: `${fmt(r.tokens_in)} vào / ${fmt(r.tokens_out)} ra` },
              { label: 'Prompt', children: html`<a href=${`#/demo/${r.id}`}>Xem các màn hình & prompt đã gửi</a>` },
            ]} />
          <//>
        <//>
      <//>
    <//>`}
  <//>`;
}

function Gallery({ r, copy }) {
  const tracks = tracksOf(r);
  const [tk, setTk] = useState(mainTrack(r));
  const pages = pagesOf(r, tk);
  const [pi, setPi] = useState(0);
  const p = pages[pi] || pages[0];
  if (!p) return html`<${A.Empty} />`;
  const full = p.shots.find((x) => x.kind === 'full');
  const mob = p.shots.find((x) => x.kind === 'mobile');
  const secs = p.shots.filter((x) => x.kind === 'section');
  const CopyBtn = ({ x }) => html`<${A.Tooltip} title="Copy ảnh để dán vào Zalo"><${A.Button} size="small" icon=${html`<${I.CopyOutlined} />`}
    style=${{ position: 'absolute', top: 8, right: 8, zIndex: 2 }} onClick=${(e) => { e.stopPropagation(); copy(() => copyImage(shotUrl(r, x.file)), 'ảnh'); }} /><//>`;
  const colors = r.brand?.colors ? Object.values(r.brand.colors) : [];
  return html`<div>
    <${A.Flex} gap=${12} align="center" wrap="wrap" style=${{ marginBottom: 12 }}>
      ${tracks.length > 1 && html`<${A.Segmented} options=${tracks} value=${tk} onChange=${(v) => { setTk(v); setPi(0); }} />`}
      <${A.Segmented} value=${pi} onChange=${setPi} options=${pages.map((x, i) => ({ value: i, label: html`<span>${x.title} <${Text} type="secondary" style=${{ fontSize: 11 }}>${VIEW_VI[x.view] || ''}</${Text}></span>` }))} />
      <span style=${{ flex: 1 }} />
      ${colors.map((c) => html`<${A.Tooltip} key=${c} title=${c}><span style=${{ width: 16, height: 16, borderRadius: 8, background: c, border: '1px solid rgba(0,0,0,.1)', display: 'inline-block' }} /><//>`)}
      ${r.brand?.style && html`<${A.Tooltip} title="Phong cách thị giác"><${A.Tag} color="magenta">${r.brand.style}</${A.Tag}><//>`}
      ${r.brand?.direction && html`<${A.Tooltip} title="Hướng bố cục"><${A.Tag}>${r.brand.direction}</${A.Tag}><//>`}
      ${r.brand?.font_heading && html`<${A.Tooltip} title="Font tiêu đề / thân bài"><${A.Tag}>${r.brand.font_heading} / ${r.brand.font_body}</${A.Tag}><//>`}
    <//>
    ${tk === 'llm' && html`<${A.Space} style=${{ marginBottom: 12 }}>
      <${A.Button} size="small" icon=${html`<${I.ExportOutlined} />`} href=${`/view/${r.id}/${encodeURIComponent(p.slug)}`} target="_blank">Mở HTML<//>
      <${A.Button} size="small" icon=${html`<${I.EditOutlined} />`} href=${`#/edit/${r.id}/${encodeURIComponent(p.slug)}`}>Sửa HTML / Prompt<//>
    <//>`}
    <${A.Image.PreviewGroup}>
      <${A.Row} gutter=${16}>
        <${A.Col} flex="auto">
          ${full && html`<div style=${{ position: 'relative' }}>
            <${CopyBtn} x=${full} />
            <${A.Image} src=${shotUrl(r, full.file)} width="100%" height=${460} rootClassName="shot-top" style=${{ borderRadius: 8, border: '1px solid #f0f0f0' }} />
            <${Text} type="secondary" style=${{ fontSize: 12 }}>${p.view === 'modal' ? 'Hộp thoại trên trang (desktop)' : p.view === 'section' ? 'Section (desktop)' : 'Toàn trang (desktop)'}</${Text}>
          </div>`}
        <//>
        ${mob && html`<${A.Col} flex="150px"><div style=${{ position: 'relative' }}>
          <${CopyBtn} x=${mob} />
          <${A.Image} src=${shotUrl(r, mob.file)} width=${150} height=${460} rootClassName="shot-top" style=${{ borderRadius: 8, border: '1px solid #f0f0f0' }} />
          <${Text} type="secondary" style=${{ fontSize: 12 }}>Điện thoại</${Text}>
        </div><//>`}
      <//>
      ${secs.length > 0 && html`<div style=${{ marginTop: 20 }}>
        <${Text} type="secondary" style=${{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>Từng phần (${secs.length})</${Text}>
        <${A.Row} gutter=${[12, 12]} style=${{ marginTop: 8 }}>
          ${secs.map((x) => html`<${A.Col} key=${x.file} xs=${12} md=${8}><div style=${{ position: 'relative' }}>
            <${CopyBtn} x=${x} />
            <${A.Image} src=${shotUrl(r, x.file)} width="100%" height=${120} rootClassName="shot-top" style=${{ borderRadius: 6, border: '1px solid #f0f0f0' }} />
            <${Text} type="secondary" ellipsis style=${{ fontSize: 12, display: 'block' }}>${SECTION_VI[x.section] || (String(x.section || '').startsWith('screen-') ? `Khung ${x.section.slice(7)}` : x.label || x.section)}</${Text}>
          </div><//>`)}
        <//>
      </div>`}
    <//>
  </div>`;
}

// ---------------------------------------------------------------- trang: Gửi tin (bạn tự gửi qua Zalo)
function SendPage() {
  const { refreshStatus, openDemo } = useStudio();
  const { message } = A.App.useApp();
  const [rows, loading, reload] = useOutreach('approved');
  const [cur, setCur] = useState(null);
  const [done, setDone] = useState({});
  const r = rows.find((x) => x.id === cur) || rows[0];
  useEffect(() => { setDone({}); }, [r?.id]);
  const mark = (k) => setDone((d) => ({ ...d, [k]: true }));
  const copy = async (k, fn, label) => { try { await fn(); mark(k); message.success(`Đã copy ${label}`); } catch (e) { message.error(e.message); } };
  const next = () => { const i = rows.findIndex((x) => x.id === r.id); setCur(rows[i + 1]?.id || rows[0]?.id || null); };
  const setSt = async (st) => {
    try { await api(`/api/outreach/${r.id}`, { method: 'PATCH', body: { status: st } }); message.success(st === 'sent' ? 'Đã ghi nhận đã gửi' : 'Đã bỏ qua lead'); next(); reload(true); refreshStatus(); }
    catch (e) { message.error(e.message); }
  };
  if (!loading && !rows.length) return html`<${A.Card}><${A.Result} icon=${html`<${I.SmileOutlined} />`} title="Không có bản nào chờ gửi"
    subTitle="Duyệt demo ở trang Duyệt demo, bản đã duyệt sẽ hiện ở đây để bạn tự gửi qua Zalo." extra=${html`<${A.Button} type="primary" href="#/demos">Tới trang Duyệt demo<//>`} /><//>`;
  const shots = r ? suggestedShots(r) : [];
  const step = (k, n, title, desc, action) => html`<${A.Card} size="small" key=${k} style=${{ borderColor: done[k] ? '#b7eb8f' : undefined, background: done[k] ? '#f6ffed' : undefined }}>
    <${A.Flex} gap=${12} align="center">
      <${A.Avatar} size=${28} style=${{ background: done[k] ? '#52c41a' : '#e6f4ff', color: done[k] ? '#fff' : '#1677ff', flexShrink: 0 }}>${done[k] ? html`<${I.CheckOutlined} />` : n}<//>
      <div style=${{ flex: 1 }}><${Text} strong>${title}</${Text}><div><${Text} type="secondary" style=${{ fontSize: 12 }}>${desc}</${Text}></div></div>
      ${action}
    <//>
  <//>`;
  return html`<${A.Row} gutter=${16}>
    <${A.Col} xs=${24} lg=${8}>
      <${A.Card} size="small" title=${`Đã duyệt · ${rows.length} lead`} styles=${{ body: { padding: 0, maxHeight: 'calc(100vh - 170px)', overflow: 'auto' } }} loading=${loading}>
        <${A.List} dataSource=${rows} renderItem=${(x) => { const s = thumbShot(x); return html`<${A.List.Item} key=${x.id} onClick=${() => setCur(x.id)}
          style=${{ cursor: 'pointer', padding: '10px 16px', background: r && x.id === r.id ? '#e6f4ff' : undefined }}>
          <${A.List.Item.Meta} avatar=${s ? html`<img src=${shotUrl(x, s.file)} style=${{ width: 40, height: 64, objectFit: 'cover', objectPosition: 'top', borderRadius: 4 }} />` : null}
            title=${x.name} description=${html`<span>${x.phone || '—'} · confident ${x.confidence ?? '—'}</span>`} />
        <//>`; }} />
      <//>
    <//>
    <${A.Col} xs=${24} lg=${16}>
      ${r && html`<${A.Card} title=${html`<div>${r.name}<div><${Text} type="secondary" style=${{ fontSize: 12, fontWeight: 400 }}>${[r.industry, r.area].filter(Boolean).join(' · ')}</${Text}></div></div>`}
        extra=${html`<${A.Button} type="link" onClick=${() => openDemo(r.id)}>Xem chi tiết<//>`}>
        <${A.Space} direction="vertical" size=${12} style=${{ width: '100%' }}>
          ${step('phone', 1, html`Copy SĐT: <span style=${{ fontVariantNumeric: 'tabular-nums' }}>${r.phone}</span>`, 'Tìm số này trong Zalo của bạn',
            html`<${A.Button} icon=${html`<${I.CopyOutlined} />`} onClick=${() => copy('phone', () => copyText(r.phone), 'SĐT')}>Copy<//>`)}
          ${step('msg', 2, 'Copy tin nhắn', 'Dán vào khung chat (chưa bấm gửi)',
            html`<${A.Button} icon=${html`<${I.CopyOutlined} />`} onClick=${() => copy('msg', () => copyText(r.message), 'tin nhắn')}>Copy<//>`)}
          <${A.Card} size="small" style=${{ background: '#fafafa' }}><${Paragraph} style=${{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13 }}>${r.message}</${Paragraph}><//>
          ${step('imgs', 3, 'Copy từng ảnh demo', 'Bấm vào ảnh để copy → dán vào khung chat, lần lượt từng ảnh, rồi tự bấm gửi', null)}
          <${A.Row} gutter=${[12, 12]}>
            ${shots.map((x) => html`<${A.Col} key=${x.file} xs=${12} sm=${8} md=${Math.max(4, Math.floor(24 / Math.max(shots.length, 1)))}>
              <div onClick=${() => copy('img:' + x.file, () => copyImage(shotUrl(r, x.file)), 'ảnh')} style=${{ cursor: 'pointer' }}>
                <img src=${shotUrl(r, x.file)} style=${{ width: '100%', height: 130, objectFit: 'cover', objectPosition: 'top', borderRadius: 6, outline: done['img:' + x.file] ? '2px solid #52c41a' : '1px solid #f0f0f0' }} />
                <${Text} type=${done['img:' + x.file] ? 'success' : 'secondary'} ellipsis style=${{ fontSize: 12, display: 'block' }}>${done['img:' + x.file] ? '✓ ' : ''}${x.why}</${Text}>
              </div>
            <//>`)}
          <//>
          <${A.Flex} gap=${8} style=${{ marginTop: 8 }}>
            <${A.Button} onClick=${next}>Để sau<//>
            <${A.Button} danger onClick=${() => setSt('skipped')}>Bỏ qua lead này<//>
            <span style=${{ flex: 1 }} />
            <${A.Button} type="primary" size="large" icon=${html`<${I.CheckOutlined} />`} style=${{ background: '#52c41a' }} onClick=${() => setSt('sent')}>Tôi đã gửi, sang khách tiếp<//>
          <//>
        <//>
      <//>`}
    <//>
  <//>`;
}

// ---------------------------------------------------------------- trang: Đã gửi (theo dõi khách sau khi nhắn)
const LEAD_STATUS = [
  { value: 'contacted', label: 'Đã liên hệ', color: 'blue' },
  { value: 'interested', label: 'Quan tâm', color: 'gold' },
  { value: 'won', label: 'Chốt', color: 'green' },
  { value: 'lost', label: 'Thất bại', color: 'red' },
  { value: 'skip', label: 'Bỏ qua', color: 'default' },
  { value: 'to_contact', label: 'Cần gọi', color: 'cyan' },
  { value: 'new', label: 'Mới', color: 'default' },
];
const endOfToday = () => dayjs().endOf('day');
const isDue = (r) => r.next_call_at && dayjs(r.next_call_at).isBefore(endOfToday()) && ['contacted', 'interested'].includes(r.lead_status);

function SentPage() {
  const { version, openDemo, refreshStatus } = useStudio();
  const { message } = A.App.useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try { setRows(await api('/api/sent')); } catch (e) { message.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(false); }, [load]);
  useEffect(() => { if (version) load(true); }, [version]);

  const update = async (r, patch, okMsg) => {
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...patch, ...(patch.status ? { lead_status: patch.status } : {}) } : x)));
    try { await api(`/api/leads/${r.business_id}`, { method: 'PATCH', body: patch }); if (okMsg) message.success(okMsg); refreshStatus(); }
    catch (e) { message.error(e.message); load(true); }
  };
  const count = (f) => rows.filter(f).length;
  const FILTERS = [
    { value: 'all', label: `Tất cả (${rows.length})`, f: () => true },
    { value: 'due', label: `Cần gọi lại hôm nay (${count(isDue)})`, f: isDue },
    { value: 'contacted', label: `Chưa phản hồi (${count((r) => r.lead_status === 'contacted')})`, f: (r) => r.lead_status === 'contacted' },
    { value: 'interested', label: `Quan tâm (${count((r) => r.lead_status === 'interested')})`, f: (r) => r.lead_status === 'interested' },
    { value: 'won', label: `Chốt (${count((r) => r.lead_status === 'won')})`, f: (r) => r.lead_status === 'won' },
    { value: 'lost', label: `Thất bại / bỏ (${count((r) => ['lost', 'skip'].includes(r.lead_status))})`, f: (r) => ['lost', 'skip'].includes(r.lead_status) },
  ];
  const f = FILTERS.find((x) => x.value === filter) || FILTERS[0];
  const shown = rows.filter(f.f).filter((r) => !q || `${r.name} ${r.phone} ${r.industry} ${r.area} ${r.note || ''}`.toLowerCase().includes(q.toLowerCase()));
  const won = count((r) => r.lead_status === 'won'), interested = count((r) => r.lead_status === 'interested');

  const columns = [
    { title: '', key: 'thumb', width: 64, render: (_, r) => { const s = thumbShot(r); return s ? html`<img src=${shotUrl(r, s.file)} style=${{ width: 44, height: 72, objectFit: 'cover', objectPosition: 'top', borderRadius: 6, border: '1px solid #f0f0f0', display: 'block' }} />` : null; } },
    { title: 'Lead', key: 'lead', render: (_, r) => html`<div style=${{ minWidth: 220 }}>
        <${A.Button} type="link" style=${{ padding: 0, height: 'auto', fontWeight: 600, whiteSpace: 'normal', textAlign: 'left' }} onClick=${() => openDemo(r.id)}>${r.name}<//>
        <div><${Text} type="secondary" style=${{ fontSize: 12 }}>${[r.industry, r.area].filter(Boolean).join(' · ')}</${Text}></div>
        <${A.Space} size=${10}>
          ${r.phone ? html`<${Text} copyable=${{ tooltips: ['Copy SĐT', 'Đã copy'] }} style=${{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>${r.phone}</${Text}>` : html`<${Text} type="secondary" style=${{ fontSize: 12 }}>Không có SĐT</${Text}>`}
          ${r.facebook_url && html`<${A.Tooltip} title="Fanpage"><a href=${r.facebook_url} target="_blank"><${I.FacebookOutlined} /></a><//>`}
          ${r.maps_url && html`<${A.Tooltip} title="Google Maps"><a href=${r.maps_url} target="_blank"><${I.EnvironmentOutlined} /></a><//>`}
        <//>
      </div>` },
    { title: 'Đã gửi', dataIndex: 'sent_at', key: 'sent', width: 130, sorter: (a, b) => Date.parse(a.sent_at || 0) - Date.parse(b.sent_at || 0), defaultSortOrder: 'descend',
      render: (v) => html`<${A.Tooltip} title=${ago(v)}><span>${v ? dayjs(v).format('DD/MM HH:mm') : '—'}<div><${Text} type="secondary" style=${{ fontSize: 12 }}>${v ? `${Math.max(0, dayjs().diff(dayjs(v), 'day'))} ngày trước` : ''}</${Text}></div></span><//>` },
    { title: 'Tin nhắn', dataIndex: 'message', key: 'msg', width: 90, render: (v) => html`<${A.Popover} title="Tin nhắn đã gửi" content=${html`<div style=${{ maxWidth: 380, whiteSpace: 'pre-wrap', fontSize: 13 }}>${v}</div>`}>
        <${A.Button} size="small" icon=${html`<${I.MessageOutlined} />`}>Xem<//><//>` },
    { title: 'Trạng thái', key: 'status', width: 160, render: (_, r) => html`<${A.Select} size="small" style=${{ width: 140 }} value=${r.lead_status}
        options=${LEAD_STATUS.map((s) => ({ value: s.value, label: html`<${A.Badge} color=${s.color === 'default' ? '#bfbfbf' : s.color} text=${s.label} />` }))}
        onChange=${(v) => update(r, { status: v }, `Đã chuyển sang "${LEAD_STATUS.find((s) => s.value === v).label}"`)} />` },
    { title: 'Hẹn gọi lại', key: 'call', width: 210, sorter: (a, b) => Date.parse(a.next_call_at || '9999') - Date.parse(b.next_call_at || '9999'),
      render: (_, r) => html`<${A.Space} size=${4}>
        <${A.DatePicker} size="small" showTime=${{ format: 'HH:mm', minuteStep: 15 }} format="DD/MM HH:mm" placeholder="Chọn ngày giờ"
          status=${isDue(r) ? 'error' : undefined} style=${{ width: 150 }} value=${r.next_call_at ? dayjs(r.next_call_at) : null}
          presets=${[{ label: 'Chiều nay 15:00', value: dayjs().hour(15).minute(0) }, { label: 'Sáng mai 9:00', value: dayjs().add(1, 'day').hour(9).minute(0) },
            { label: '3 ngày nữa', value: dayjs().add(3, 'day').hour(9).minute(0) }, { label: '1 tuần nữa', value: dayjs().add(7, 'day').hour(9).minute(0) }]}
          onChange=${(v) => update(r, { next_call_at: v ? v.toISOString() : null }, v ? `Hẹn gọi lại ${v.format('DD/MM HH:mm')}` : 'Đã bỏ hẹn')} />
        ${isDue(r) && html`<${A.Tooltip} title="Đến hạn gọi lại"><${I.BellFilled} style=${{ color: '#ff4d4f' }} /><//>`}
      <//>` },
    { title: 'Ghi chú', key: 'note', render: (_, r) => html`<${Paragraph} style=${{ margin: 0, minWidth: 180, fontSize: 13 }}
        editable=${{ tooltip: 'Sửa ghi chú', text: r.note || '', onChange: (v) => v !== (r.note || '') && update(r, { note: v }, 'Đã lưu ghi chú') }}>
        ${r.note || html`<${Text} type="secondary">—</${Text}>`}</${Paragraph}>` },
  ];

  return html`<${A.Space} direction="vertical" size=${16} style=${{ width: '100%' }}>
    <${A.Row} gutter=${16}>
      ${[['Đã gửi', rows.length, null], ['Cần gọi lại hôm nay', count(isDue), count(isDue) ? '#ff4d4f' : null], ['Quan tâm', interested, '#faad14'],
        ['Chốt', won, '#52c41a'], ['Tỉ lệ chốt', rows.length ? `${Math.round((won / rows.length) * 100)}%` : '—', null]].map(([t, v, c]) => html`<${A.Col} key=${t} xs=${12} md=${8} xl=${4}>
        <${A.Card} size="small"><${A.Statistic} title=${t} value=${v} valueStyle=${c ? { color: c } : undefined} /><//>
      <//>`)}
    <//>
    <${A.Card} size="small" styles=${{ body: { padding: 0 } }}
      title=${html`<${A.Segmented} value=${filter} onChange=${setFilter} options=${FILTERS.map(({ value, label }) => ({ value, label }))} />`}
      extra=${html`<${A.Input} prefix=${html`<${I.SearchOutlined} />`} placeholder="Tìm tên, SĐT, ghi chú…" allowClear style=${{ width: 240 }} value=${q} onChange=${(e) => setQ(e.target.value)} />`}>
      <${A.Table} rowKey=${(r) => String(r.id)} size="middle" loading=${loading} columns=${columns} dataSource=${shown} scroll=${{ x: 1100 }}
        rowClassName=${(r) => (isDue(r) ? 'row-due' : '')}
        pagination=${{ pageSize: 30, hideOnSinglePage: true, showTotal: (n) => `${n} lead` }}
        locale=${{ emptyText: html`<${A.Empty} description=${filter === 'all' ? 'Chưa gửi cho khách nào. Duyệt demo rồi dùng trang Gửi tin, bấm "Tôi đã gửi" để lead hiện ở đây.' : 'Không có lead nào'} />` }} />
    <//>
  <//>`;
}

// ---------------------------------------------------------------- trang: Chi tiết demo (các màn hình + prompt đã gửi)
const STEP_LABELS = { oldsite: 'Phân tích website cũ', plan: 'Lên kế hoạch (tin nhắn + thương hiệu + màn hình)', judge: 'Chấm điểm' };
function PromptView({ messages }) {
  return html`<${A.Space} direction="vertical" size=${12} style=${{ width: '100%' }}>
    ${(messages || []).map((m, i) => html`<div key=${i}>
      <${A.Flex} gap=${8} align="center" style=${{ marginBottom: 6 }}>
        <${A.Tag} color=${m.role === 'system' ? 'purple' : m.role === 'user' ? 'blue' : 'default'}>${m.role}</${A.Tag}>
        <${Text} type="secondary" style=${{ fontSize: 12 }}>${fmt(m.content.length)} ký tự</${Text}>
        <span style=${{ flex: 1 }} />
        <${Text} copyable=${{ text: m.content, tooltips: ['Copy', 'Đã copy'] }} />
      <//>
      <pre style=${{ whiteSpace: 'pre-wrap', margin: 0, background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, fontSize: 12.5, maxHeight: 420, overflow: 'auto', fontFamily: 'ui-monospace, Menlo, monospace' }}>${m.content}</pre>
    </div>`)}
  <//>`;
}

function DemoPage() {
  const { route, version, openDemo } = useStudio();
  const { message } = A.App.useApp();
  const id = route[1];
  const [r, setR] = useState(null);
  const [p, setP] = useState(null);
  const load = useCallback(async () => {
    try { const [a, b] = await Promise.all([api(`/api/outreach/${id}`), api(`/api/outreach/${id}/prompts`)]); setR(a); setP(b); }
    catch (e) { message.error(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (version) load(); }, [version]);
  if (!r || !p) return html`<${A.Skeleton} active />`;
  const screens = p.screens || [];
  const planned = (p.planned || []).filter((x) => !screens.some((s) => s.slug === x.slug));
  const shotsOf = (slug) => (r.shots || []).filter((x) => trackOf(x) === 'llm' && x.page === slug);
  const steps = Object.entries(STEP_LABELS).filter(([k]) => p.prompts?.[k]);
  return html`<${A.Space} direction="vertical" size=${16} style=${{ width: '100%' }}>
    <${A.Card} size="small">
      <${A.Flex} gap=${16} align="center" wrap="wrap">
        <div style=${{ flex: 1, minWidth: 260 }}>
          <${Title} level=${4} style=${{ margin: 0 }}>${r.name}</${Title}>
          <${Text} type="secondary">${[r.industry, r.area, r.website_label].filter(Boolean).join(' · ')}</${Text}>
        </div>
        <${A.Space} wrap>
          <${A.Tag} color=${DEMO_STATUS[r.status]?.color}>${DEMO_STATUS[r.status]?.label}</${A.Tag}>
          ${r.brand?.style && html`<${A.Tag} color="magenta">${r.brand.style}</${A.Tag}>`}
          ${r.brand?.direction && html`<${A.Tag}>${r.brand.direction}</${A.Tag}>`}
          ${r.old_site_url && html`<${A.Tag} color="purple">Làm mới web cũ</${A.Tag}>`}
        <//>
        ${r.confidence != null && html`<${A.Statistic} title="Confident" value=${r.confidence} valueStyle=${{ color: scoreColor(r.confidence) }} />`}
        <${A.Statistic} title="Token vào / ra" value=${`${fmt(r.tokens_in)} / ${fmt(r.tokens_out)}`} valueStyle=${{ fontSize: 18 }} />
        <${A.Button} type="primary" onClick=${() => openDemo(r.id)}>Duyệt & tin nhắn<//>
      <//>
      ${r.status === 'generating' && html`<${A.Alert} style=${{ marginTop: 12 }} type="info" showIcon icon=${html`<${I.LoadingOutlined} />`} message="Đang tạo demo — trang tự cập nhật khi xong." />`}
      ${r.status === 'failed' && html`<${A.Alert} style=${{ marginTop: 12 }} type="error" showIcon message="Tạo demo lỗi" description=${r.error} />`}
    <//>

    <${A.Card} size="small" title=${`Các màn hình LLM thiết kế (${screens.length})`}>
      ${screens.length || planned.length ? html`<${A.Row} gutter=${[16, 16]}>
        ${screens.map((s) => { const sh = shotsOf(s.slug); const thumb = sh.find((x) => x.kind === 'full') || sh[0]; return html`<${A.Col} key=${s.slug} xs=${24} sm=${12} lg=${8} xxl=${6}>
          <${A.Card} size="small" hoverable
            cover=${thumb ? html`<img src=${shotUrl(r, thumb.file)} style=${{ height: 220, objectFit: 'cover', objectPosition: 'top' }} />` : html`<div style=${{ height: 220, background: '#fafafa', display: 'grid', placeItems: 'center', color: '#bfbfbf' }}><${I.PictureOutlined} style=${{ fontSize: 28 }} /></div>`}
            actions=${[
              html`<a key="v" href=${`/view/${r.id}/${encodeURIComponent(s.slug)}`} target="_blank"><${I.ExportOutlined} /> Mở HTML</a>`,
              html`<a key="e" href=${`#/edit/${r.id}/${encodeURIComponent(s.slug)}`}><${I.EditOutlined} /> Sửa / prompt</a>`,
            ]}>
            <${A.Card.Meta} title=${html`<${A.Space}>${s.title}<${A.Tag}>${VIEW_VI[s.kind] || s.kind}</${A.Tag}>${s.regenerated_at ? html`<${A.Tag} color="blue">gen lại</${A.Tag}>` : s.edited_at ? html`<${A.Tag} color="green">đã sửa</${A.Tag}>` : null}<//>`}
              description=${html`<${Paragraph} type="secondary" ellipsis=${{ rows: 3, tooltip: s.brief }} style=${{ margin: 0, fontSize: 13 }}>${s.brief || '—'}</${Paragraph}>`} />
          <//>
        <//>`; })}
        ${planned.map((s) => html`<${A.Col} key=${s.slug} xs=${24} sm=${12} lg=${8} xxl=${6}>
          <${A.Card} size="small" style=${{ borderStyle: 'dashed' }}>
            <${A.Card.Meta} title=${html`<${A.Space}>${s.title}<${A.Tag} color=${r.status === 'generating' ? 'processing' : 'red'}>${r.status === 'generating' ? 'đang tạo' : 'không tạo được'}</${A.Tag}><//>`}
              description=${html`<${Paragraph} type="secondary" ellipsis=${{ rows: 3 }} style=${{ margin: 0, fontSize: 13 }}>${s.brief || '—'}</${Paragraph}>`} />
          <//>
        <//>`)}
      <//>` : html`<${A.Empty} description=${r.status === 'generating' ? 'Đang tạo…' : 'Chưa có màn hình nào'} />`}
    <//>

    <${A.Card} size="small" title="Prompt đã gửi cho LLM" extra=${html`<${Text} type="secondary" style=${{ fontSize: 12 }}>Prompt viết HTML của từng màn hình nằm ở trang Sửa / prompt</${Text}>`}>
      ${steps.length ? html`<${A.Collapse} items=${steps.map(([k, label], i) => ({
        key: k,
        label: html`<${A.Space}><span>${i + 1}. ${label}</span><${Text} type="secondary" style=${{ fontSize: 12 }}>${fmt(p.prompts[k].reduce((n, m) => n + m.content.length, 0))} ký tự</${Text}><//>`,
        children: html`<${PromptView} messages=${p.prompts[k]} />`,
      }))} />` : html`<${A.Empty} image=${A.Empty.PRESENTED_IMAGE_SIMPLE} description=${r.status === 'generating' ? 'Prompt được lưu khi tạo xong' : 'Bản demo này chưa lưu prompt'} />`}
    <//>
  <//>`;
}

// ---------------------------------------------------------------- trang: Sửa 1 màn hình (HTML / prompt / lịch sử)
const SRC_VI = { llm: 'LLM gen', edit: 'Sửa tay', regen: 'Gen lại' };
function EditorPage() {
  const { route, refreshStatus } = useStudio();
  const { message, modal } = A.App.useApp();
  const [id, slug] = [route[1], route[2]];
  const apiBase = `/api/outreach/${id}/pages/${encodeURIComponent(slug)}`;
  const viewUrl = `/view/${id}/${encodeURIComponent(slug)}`;
  const [d, setD] = useState(null);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState('');
  const [prompt, setPrompt] = useState({ system: '', user: '' });
  const [savedPrompt, setSavedPrompt] = useState({ system: '', user: '' });
  const [frame, setFrame] = useState(viewUrl);
  const [tab, setTab] = useState('html');
  const [busy, setBusy] = useState('');
  const poll = useRef(null);
  const dirty = code !== saved;

  const load = useCallback(async (first) => {
    const x = await api(apiBase);
    setD(x);
    setSaved(x.html);
    setSavedPrompt(x.prompt);
    if (first) { setCode(x.html); setPrompt(x.prompt); }
    return x;
  }, [apiBase]);
  useEffect(() => { load(true).then((x) => x.regen?.running && watch()).catch((e) => message.error(e.message)); return () => clearTimeout(poll.current); }, [load]);
  useEffect(() => { const f = (e) => { if (dirty) e.preventDefault(); }; addEventListener('beforeunload', f); return () => removeEventListener('beforeunload', f); }, [dirty]);

  const watch = () => {
    clearTimeout(poll.current);
    poll.current = setTimeout(async () => {
      try {
        const x = await load(false);
        if (x.regen?.running) return watch();
        setBusy('');
        if (x.regen?.error) message.error(`Gen lại lỗi: ${x.regen.error}`);
        else { setCode(x.html); setFrame(`${viewUrl}?t=${Date.now()}`); message.success(`Đã gen lại & chụp ${x.regen?.shots ?? ''} ảnh`); refreshStatus(); }
      } catch { watch(); }
    }, 4000);
  };
  const post = async (path, body) => api(apiBase + path, { method: 'POST', body });
  const preview = async () => { setBusy('preview'); try { const x = await post('/preview', { html: code }); setFrame(x.url); message.info('Bản xem trước (chưa lưu)'); } catch (e) { message.error(e.message); } finally { setBusy(''); } };
  const save = async () => {
    setBusy('save');
    try { const x = await post('', { html: code }); setFrame(`${viewUrl}?t=${Date.now()}`); message.success(`Đã lưu, chụp lại ${x.shots} ảnh`); await load(false); refreshStatus(); }
    catch (e) { message.error(e.message); } finally { setBusy(''); }
  };
  const regen = () => {
    const go = async () => {
      setBusy('regen');
      try { await post('/regenerate', prompt); setSavedPrompt(prompt); message.info('LLM đang gen lại (1–5 phút)…'); watch(); }
      catch (e) { setBusy(''); message.error(e.message); }
    };
    if (dirty) modal.confirm({ title: 'HTML đang sửa chưa lưu', content: 'Bản LLM gen lại sẽ thay HTML đang sửa dở. Tiếp tục?', okText: 'Gen lại', cancelText: 'Huỷ', onOk: go });
    else go();
  };
  const loadVersion = async (vid) => {
    try { const v = await api(`/api/page-versions/${vid}`); setCode(v.html); if (v.prompt) setPrompt(v.prompt); setTab('html'); message.info(`Đã nạp phiên bản ${ago(v.created_at)} (chưa lưu)`); }
    catch (e) { message.error(e.message); }
  };
  useEffect(() => {
    const f = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (!busy) save(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (!busy) preview(); }
    };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  });

  if (!d) return html`<div style=${{ padding: 24 }}><${A.Skeleton} active /></div>`;
  const mono = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.55 };
  const area = { ...mono, height: '100%', resize: 'none', border: 0, borderRadius: 0 };
  const regenRunning = busy === 'regen' || d.regen?.running;
  const tabs = [
    { key: 'html', label: html`<span>HTML${dirty ? ' •' : ''}</span>`, children: html`<div style=${{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <${A.Flex} gap=${8} style=${{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }} wrap="wrap">
        <${A.Button} disabled=${!dirty || !!busy} onClick=${() => setCode(saved)}>Hoàn tác<//>
        <${A.Tooltip} title="Ctrl+Enter"><${A.Button} loading=${busy === 'preview'} disabled=${!!busy && busy !== 'preview'} onClick=${preview}>Xem trước<//><//>
        <${A.Tooltip} title="Ctrl+S"><${A.Button} type="primary" loading=${busy === 'save'} disabled=${!!busy && busy !== 'save'} onClick=${save}>Lưu & chụp lại<//><//>
      <//>
      <${A.Input.TextArea} value=${code} onChange=${(e) => setCode(e.target.value)} spellCheck=${false} style=${{ ...area, flex: 1, padding: 12 }} />
    </div>` },
    { key: 'prompt', label: 'Prompt', children: html`<div style=${{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <${A.Flex} gap=${8} align="center" style=${{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }} wrap="wrap">
        <${A.Button} disabled=${regenRunning || (prompt.system === savedPrompt.system && prompt.user === savedPrompt.user)} onClick=${() => setPrompt(savedPrompt)}>Hoàn tác<//>
        <${A.Button} type="primary" icon=${html`<${I.ThunderboltOutlined} />`} loading=${regenRunning} disabled=${!!busy && !regenRunning} onClick=${regen}>${regenRunning ? 'LLM đang gen lại…' : 'Lưu prompt & gen lại'}<//>
      <//>
      <${A.Alert} type="info" banner showIcon=${false} style=${{ fontSize: 12 }} message=${html`<span>SYSTEM gửi đi = file <a href="/skill" target="_blank">skills/frontend-design.md</a> (${fmt(d.skill_chars)} ký tự, luôn dùng bản mới nhất) + phần SYSTEM dưới đây.${d.prompt_rebuilt ? ' Bản này tạo trước khi có tính năng lưu prompt → prompt được dựng lại gần đúng.' : ''}</span>`} />
      <div style=${{ padding: '8px 12px 4px' }}><${Text} strong style=${{ fontSize: 12 }}>SYSTEM</${Text}></div>
      <${A.Input.TextArea} value=${prompt.system} onChange=${(e) => setPrompt({ ...prompt, system: e.target.value })} spellCheck=${false} style=${{ ...mono, height: 110, resize: 'none', borderRadius: 0, borderLeft: 0, borderRight: 0, padding: 12 }} />
      <div style=${{ padding: '8px 12px 4px' }}><${Text} strong style=${{ fontSize: 12 }}>USER</${Text}> <${Text} type="secondary" style=${{ fontSize: 12 }}>${fmt(prompt.user.length)} ký tự</${Text}></div>
      <${A.Input.TextArea} value=${prompt.user} onChange=${(e) => setPrompt({ ...prompt, user: e.target.value })} spellCheck=${false} style=${{ ...area, flex: 1, padding: 12 }} />
    </div>` },
    { key: 'vers', label: html`<span>Lịch sử <${A.Badge} count=${d.versions.length} size="small" color="#d9d9d9" /></span>`, children: html`<div style=${{ height: '100%', overflow: 'auto' }}>
      <${A.List} dataSource=${d.versions} locale=${{ emptyText: 'Chưa có phiên bản nào được lưu' }} renderItem=${(v) => html`<${A.List.Item} key=${v.id} style=${{ padding: '10px 16px' }}
        actions=${[html`<${A.Button} size="small" onClick=${() => loadVersion(v.id)}>Nạp<//>`]}>
        <${A.List.Item.Meta} avatar=${html`<${A.Tag} color=${{ llm: 'purple', edit: 'green', regen: 'blue' }[v.source]}>${SRC_VI[v.source] || v.source}</${A.Tag}>`}
          title=${ago(v.created_at)} description=${`${fmt(v.chars)} ký tự${v.tokens_in ? ` · ${fmt(v.tokens_in)}/${fmt(v.tokens_out)} token` : ''}`} />
      <//>`} />
    </div>` },
  ];
  return html`<div style=${{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
    <${A.Flex} gap=${12} align="center" style=${{ padding: '10px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0' }} wrap="wrap">
      <${Text} strong>${d.title}</${Text}><${A.Tag}>${VIEW_VI[d.kind] || d.kind}</${A.Tag}>
      <${A.Button} type="link" size="small" href=${`#/demo/${id}`} style=${{ padding: 0 }}>Demo #${id}<//>
      ${d.status === 'generating' && html`<${A.Tag} color="processing">Bản demo đang được tạo</${A.Tag}>`}
      <span style=${{ flex: 1 }} />
      <${A.Button} size="small" icon=${html`<${I.ReloadOutlined} />`} onClick=${() => setFrame(`${viewUrl}?t=${Date.now()}`)}>Tải lại khung xem<//>
      <${A.Button} size="small" icon=${html`<${I.ExportOutlined} />`} href=${viewUrl} target="_blank">Mở trang<//>
    <//>
    <div style=${{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(380px, 44%) 1fr', minHeight: 0 }}>
      <div style=${{ background: '#fff', borderRight: '1px solid #f0f0f0', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <${A.Tabs} activeKey=${tab} onChange=${setTab} items=${tabs} tabBarStyle=${{ margin: 0, padding: '0 12px' }}
          style=${{ height: '100%' }} className="editor-tabs" />
      </div>
      <iframe src=${frame} style=${{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
    </div>
  </div>`;
}

// ---------------------------------------------------------------- trang: Cài đặt
const SETTINGS_META = {
  outreach_auto_generate: { group: 'Tạo demo', label: 'Tự tạo demo theo lịch hằng ngày', type: 'bool' },
  outreach_parallel_leads: { group: 'Tạo demo', label: 'Số lead tạo song song cùng lúc', type: 'num', min: 1, max: 10 },
  outreach_per_run: { group: 'Tạo demo', label: 'Số lead mỗi lượt tự động', type: 'num', min: 1, max: 50 },
  outreach_min_lead_score: { group: 'Tạo demo', label: 'Điểm lead tối thiểu (lượt tự động)', type: 'num', min: 0, max: 100 },
  outreach_max_pages: { group: 'Tạo demo', label: 'Số màn hình tối đa mỗi demo', type: 'num', min: 1, max: 6 },
  outreach_old_site: { group: 'Tạo demo', label: 'Làm mới từ website cũ (nếu web còn sống)', type: 'bool' },
  outreach_llm_concurrency: { group: 'Tạo demo', label: 'Số màn hình gọi LLM song song (trong 1 lead)', type: 'num', min: 1, max: 8 },
  outreach_ready_threshold: { group: 'Duyệt', label: 'Ngưỡng "Sẵn sàng" (confident)', type: 'num', min: 0, max: 100 },
  outreach_sender_name: { group: 'Tin nhắn', label: 'Tên ký cuối tin nhắn', type: 'text' },
  outreach_sender_intro: { group: 'Tin nhắn', label: 'Giới thiệu bạn là ai', type: 'text' },
  outreach_image_check: { group: 'Ảnh', label: 'MiMo duyệt ảnh stock trước khi chèn', type: 'bool' },
  outreach_image_min_fit: { group: 'Ảnh', label: 'Độ phù hợp tối thiểu của ảnh', type: 'num', min: 0, max: 100 },
};
function SettingsPage() {
  const { refreshStatus } = useStudio();
  const { message } = A.App.useApp();
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/api/settings').then(setRows).catch((e) => message.error(e.message)); }, []);
  const save = async (key, value) => {
    try { await api(`/api/settings/${key}`, { method: 'PUT', body: { value: String(value) } }); setRows((rs) => rs.map((x) => (x.key === key ? { ...x, value: String(value) } : x))); message.success('Đã lưu'); refreshStatus(); }
    catch (e) { message.error(e.message); }
  };
  if (!rows) return html`<${A.Skeleton} active />`;
  const groups = {};
  for (const s of rows) { const m = SETTINGS_META[s.key] || { group: 'Khác', label: s.key, type: 'text' }; (groups[m.group] ||= []).push({ ...s, m }); }
  const field = (s) => {
    const { m } = s;
    if (m.type === 'bool') return html`<${A.Switch} checked=${s.value === 'true'} onChange=${(v) => save(s.key, v)} />`;
    if (m.type === 'num') return html`<${A.InputNumber} min=${m.min} max=${m.max} defaultValue=${Number(s.value)} onBlur=${(e) => e.target.value !== s.value && save(s.key, e.target.value)} onPressEnter=${(e) => e.target.blur()} />`;
    if (m.type === 'select') return html`<${A.Select} value=${s.value} options=${m.options} style=${{ width: 240 }} onChange=${(v) => save(s.key, v)} />`;
    return html`<${A.Input} defaultValue=${s.value} style=${{ maxWidth: 420 }} onBlur=${(e) => e.target.value !== s.value && save(s.key, e.target.value)} onPressEnter=${(e) => e.target.blur()} />`;
  };
  return html`<${A.Space} direction="vertical" size=${16} style=${{ width: '100%', maxWidth: 900 }}>
    ${Object.entries(groups).map(([g, list]) => html`<${A.Card} key=${g} title=${g} size="small">
      ${list.map((s, i) => html`<div key=${s.key}>
        ${i > 0 && html`<${A.Divider} style=${{ margin: '12px 0' }} />`}
        <${A.Flex} gap=${24} align="center" justify="space-between" wrap="wrap">
          <div style=${{ flex: '1 1 360px' }}><${Text} strong>${s.m.label}</${Text}><div><${Text} type="secondary" style=${{ fontSize: 12 }}>${s.description}</${Text}></div></div>
          ${field(s)}
        <//>
      </div>`)}
    <//>`)}
  <//>`;
}

// ---------------------------------------------------------------- khởi động
const THEME = {
  token: { colorPrimary: '#1677ff', borderRadius: 8, fontFamily: '"Be Vietnam Pro", system-ui, sans-serif', colorBgLayout: '#f5f7fa' },
  components: { Layout: { siderBg: '#fff', headerBg: '#fff' }, Menu: { itemBorderRadius: 8, itemMarginInline: 8 } },
};
function Root() {
  return html`<${A.ConfigProvider} locale=${antd.locales?.vi_VN} theme=${THEME}><${A.App}><${Shell} /><//><//>`;
}
ReactDOM.createRoot(document.getElementById('root')).render(html`<${Root} />`);
