
/**
 * ZOHO INSIGHT PRO - ENTERPRISE DATA HUB
 * Refined for GitHub Pages & Zoho OAuth2 Implicit Flow
 */

class ZohoInsightApp {
  constructor() {
    this.config = JSON.parse(localStorage.getItem('zoho_config')) || {
      clientId: '',
      orgId: '',
      region: 'com'
    };
    
    this.state = {
      accessToken: null,
      data: [],
      currentView: 'overview',
      currentModule: 'invoices'
    };

    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.cacheDOM();
    this.bindEvents();
    this.handleCallback();
    this.checkSession();
    this.updateRedirectUriDisplay();
    this.log("System Initialized. Awaiting Configuration.");
  }

  cacheDOM() {
    this.viewLanding = document.getElementById('view-landing');
    this.viewDashboard = document.getElementById('view-dashboard');
    this.viewTitle = document.getElementById('view-title');
    this.viewSubtitle = document.getElementById('view-subtitle');
    this.btnConnect = document.getElementById('btn-connect');
    this.btnSync = document.getElementById('btn-sync');
    this.btnGeneratePdf = document.getElementById('btn-generate-pdf');
    this.btnLogout = document.getElementById('btn-logout');
    this.modalConfig = document.getElementById('modal-config');
    this.datasetLog = document.getElementById('dataset-log');
    this.displayUri = document.getElementById('display-uri');
    this.displayDomain = document.getElementById('display-domain');
    this.statusDot = document.getElementById('status-dot');
    this.syncStatusText = document.getElementById('sync-status');
    this.btnOpenConfigLanding = document.getElementById('btn-open-config-landing');
    this.btnOpenConfigSidebar = document.getElementById('btn-open-config-sidebar');
    this.btnCloseConfig = document.getElementById('btn-close-config');
    this.btnSaveConfig = document.getElementById('btn-save-config');
    this.btnCopyUri = document.getElementById('btn-copy-uri');
    this.btnCopyDomain = document.getElementById('btn-copy-domain');
    this.btnClearLogs = document.getElementById('btn-clear-logs');
    this.tableRecent = document.getElementById('table-recent');
    this.tableHeadRow = document.getElementById('table-head-row');
    this.statRevenue = document.getElementById('stat-revenue');
    this.statPending = document.getElementById('stat-pending');
    this.metricLabel = document.getElementById('metric-label');
    this.moduleSelector = document.getElementById('data-module-selector');
  }

  getRedirectUri() {
    let base = window.location.origin + window.location.pathname;
    if (!base.endsWith('/')) base += '/';
    return base;
  }

  getJavaScriptDomain() {
    return window.location.origin;
  }

  updateRedirectUriDisplay() {
    const uri = this.getRedirectUri();
    const domain = this.getJavaScriptDomain();
    if (this.displayUri) this.displayUri.innerText = uri;
    if (this.displayDomain) this.displayDomain.innerText = domain;
  }

  bindEvents() {
    this.btnConnect?.addEventListener('click', () => this.startAuth());
    this.btnLogout?.addEventListener('click', () => this.logout());
    this.btnSync?.addEventListener('click', () => this.fetchLiveModule());
    this.btnGeneratePdf?.addEventListener('click', () => this.generatePDF());
    this.btnClearLogs?.addEventListener('click', () => this.clearLogs());
    this.btnOpenConfigLanding?.addEventListener('click', () => this.toggleConfig(true));
    this.btnOpenConfigSidebar?.addEventListener('click', () => this.toggleConfig(true));
    this.btnCloseConfig?.addEventListener('click', () => this.toggleConfig(false));
    this.btnSaveConfig?.addEventListener('click', () => this.saveConfig());
    
    this.btnCopyUri?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.getRedirectUri());
      this.btnCopyUri.innerText = "OK";
      setTimeout(() => this.btnCopyUri.innerText = "COPY", 2000);
    });

    this.btnCopyDomain?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.getJavaScriptDomain());
      this.btnCopyDomain.innerText = "OK";
      setTimeout(() => this.btnCopyDomain.innerText = "COPY", 2000);
    });

    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', (e) => {
        this.switchView(e.currentTarget.getAttribute('data-target'));
      });
    });

    this.moduleSelector?.addEventListener('change', (e) => {
      this.state.currentModule = e.target.value;
      if (this.state.accessToken) this.fetchLiveModule();
    });
  }

  toggleConfig(show) {
    if (!this.modalConfig) return;
    this.modalConfig.classList.toggle('view-hidden', !show);
    if (show) {
      this.updateRedirectUriDisplay();
      document.getElementById('cfg-client-id').value = this.config.clientId || '';
      document.getElementById('cfg-org-id').value = this.config.orgId || '';
      document.getElementById('cfg-region').value = this.config.region || 'com';
    }
  }

  saveConfig() {
    this.config = {
      clientId: document.getElementById('cfg-client-id').value.trim(),
      orgId: document.getElementById('cfg-org-id').value.trim(),
      region: document.getElementById('cfg-region').value
    };
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.toggleConfig(false);
    this.log(`[CONFIG]: Saved. Region: ${this.config.region}, Org: ${this.config.orgId}`);
  }

  startAuth() {
    if (!this.config.clientId) {
      alert("Missing Client ID. Go to Settings.");
      this.toggleConfig(true);
      return;
    }

    const redirectUri = this.getRedirectUri();
    const scopes = [
      "ZohoBooks.invoices.READ",
      "ZohoBooks.contacts.READ",
      "ZohoBooks.settings.READ",
      "ZohoBooks.items.READ"
    ].join(',');

    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?` + 
      `scope=${scopes}&` +
      `client_id=${this.config.clientId}&` +
      `response_type=token&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `prompt=consent`;

    this.log(`[AUTH]: Redirecting to Zoho ${this.config.region}...`);
    window.location.href = authUrl;
  }

  handleCallback() {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      if (token) {
        this.state.accessToken = token;
        localStorage.setItem('zoho_access_token', token);
        window.history.replaceState({}, document.title, window.location.pathname);
        this.setConnectedUI(true);
        this.log("[AUTH]: Success. Connection Established.");
        this.fetchLiveModule();
      }
    }
  }

  checkSession() {
    const token = localStorage.getItem('zoho_access_token');
    if (token) {
      this.state.accessToken = token;
      this.setConnectedUI(true);
      this.switchView('overview');
      this.fetchLiveModule();
    }
  }

  setConnectedUI(connected) {
    if (connected) {
      this.viewLanding?.classList.add('view-hidden');
      this.viewDashboard?.classList.remove('view-hidden');
      this.statusDot?.classList.replace('bg-red-600', 'bg-green-500');
      if (this.syncStatusText) this.syncStatusText.innerText = "ACTIVE";
      if (this.viewSubtitle) this.viewSubtitle.innerText = `Organization Context: ${this.config.orgId}`;
    }
  }

  logout() {
    localStorage.removeItem('zoho_access_token');
    window.location.reload();
  }

  async fetchLiveModule() {
    if (!this.state.accessToken || !this.config.orgId) return;

    const module = this.state.currentModule;
    this.log(`[DATA]: Requesting ${module.toUpperCase()}...`);
    this.btnSync.disabled = true;
    this.btnSync.innerText = "SYNCING...";

    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?organization_id=${this.config.orgId}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}` }
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const result = await response.json();
      this.state.data = result[module] || [];
      this.updateDashboardUI();
      this.log(`[DATA]: Synchronized ${this.state.data.length} items.`);
    } catch (err) {
      this.log(`[ERROR]: ${err.message}`);
    } finally {
      this.btnSync.disabled = false;
      this.btnSync.innerText = "REFRESH LIVE";
    }
  }

  updateDashboardUI() {
    const module = this.state.currentModule;
    this.statPending.innerText = this.state.data.length;

    let head = "";
    let body = "";

    if (module === 'invoices') {
      const total = this.state.data.reduce((acc, i) => acc + (i.total || 0), 0);
      this.statRevenue.innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits:2})}`;
      this.metricLabel.innerText = "Total Invoice Volume";
      head = `<th class="py-5 px-8">ID</th><th class="py-5">CLIENT</th><th class="py-5">STATUS</th><th class="py-5 text-right px-8">AMOUNT</th>`;
      body = this.state.data.map(i => `
        <tr class="hover:bg-white/[0.02]">
          <td class="py-4 px-8 font-mono text-indigo-400 font-bold">${i.invoice_number}</td>
          <td class="py-4 font-bold">${i.customer_name}</td>
          <td class="py-4"><span class="px-2 py-1 rounded bg-white/5 text-[9px] uppercase font-black">${i.status}</span></td>
          <td class="py-4 text-right px-8 font-bold font-mono">$${(i.total || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    } else if (module === 'contacts') {
      this.statRevenue.innerText = this.state.data.length;
      this.metricLabel.innerText = "Active Customers";
      head = `<th class="py-5 px-8">ID</th><th class="py-5">NAME</th><th class="py-5 text-center">CURRENCY</th><th class="py-5 text-right px-8">RECEIVABLE</th>`;
      body = this.state.data.map(c => `
        <tr class="hover:bg-white/[0.02]">
          <td class="py-4 px-8 font-mono text-indigo-400 font-bold">${c.contact_id}</td>
          <td class="py-4 font-bold">${c.contact_name}</td>
          <td class="py-4 text-center text-neutral-500 font-mono text-xs">${c.currency_code}</td>
          <td class="py-4 text-right px-8 font-bold font-mono">$${(c.outstanding_receivable_amount || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    } else {
      this.statRevenue.innerText = this.state.data.length;
      this.metricLabel.innerText = "Items in Registry";
      head = `<th class="py-5 px-8">SKU</th><th class="py-5">NAME</th><th class="py-5">STOCK</th><th class="py-5 text-right px-8">RATE</th>`;
      body = this.state.data.map(item => `
        <tr class="hover:bg-white/[0.02]">
          <td class="py-4 px-8 font-mono text-indigo-400 font-bold">${item.sku || item.item_id}</td>
          <td class="py-4 font-bold">${item.name}</td>
          <td class="py-4">${item.stock_on_hand || 0}</td>
          <td class="py-4 text-right px-8 font-bold font-mono">$${(item.rate || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    }

    this.tableHeadRow.innerHTML = head;
    this.tableRecent.innerHTML = body || '<tr><td colspan="4" class="py-20 text-center text-neutral-600 italic">No records found.</td></tr>';
  }

  switchView(viewId) {
    this.state.currentView = viewId;
    document.querySelectorAll('[id^="content-"]').forEach(el => el.classList.add('view-hidden'));
    document.getElementById(`content-${viewId}`).classList.remove('view-hidden');
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-target') === viewId);
    });
    this.viewTitle.innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);
  }

  log(msg) {
    if (!this.datasetLog) return;
    const time = new Date().toLocaleTimeString();
    this.datasetLog.innerHTML += `<div><span class="text-neutral-600">[${time}]</span> ${msg}</div>`;
    this.datasetLog.scrollTop = this.datasetLog.scrollHeight;
  }

  clearLogs() {
    if (this.datasetLog) this.datasetLog.innerHTML = "";
  }

  generatePDF() {
    const element = document.getElementById('report-template');
    html2pdf().from(element).save();
  }
}

window.app = new ZohoInsightApp();
