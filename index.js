
/**
 * ZOHO INSIGHT PRO - ENTERPRISE DATA HUB
 * Enhanced with Projects, Organization Data, and Statement Engine
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
      orgData: null,
      currentView: 'overview',
      currentModule: 'invoices',
      selectedRecord: null
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
    this.log("System Ready. Waiting for Secure Connection.");
  }

  cacheDOM() {
    this.viewLanding = document.getElementById('view-landing');
    this.viewDashboard = document.getElementById('view-dashboard');
    this.viewTitle = document.getElementById('view-title');
    this.viewSubtitle = document.getElementById('view-subtitle');
    this.orgNameBadge = document.getElementById('org-name-badge');
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
    this.btnBackToOverview = document.getElementById('btn-back-to-overview');
    this.btnPrintStatement = document.getElementById('btn-print-statement');
    this.statementCanvas = document.getElementById('statement-canvas');
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
    this.btnBackToOverview?.addEventListener('click', () => this.switchView('overview'));
    this.btnPrintStatement?.addEventListener('click', () => this.printStatement());
    
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
    this.log(`[CONFIG]: Saved. Context Region: ${this.config.region}`);
    if (this.state.accessToken) this.fetchOrgProfile();
  }

  startAuth() {
    if (!this.config.clientId) {
      alert("Missing Client ID. Update settings first.");
      this.toggleConfig(true);
      return;
    }

    const redirectUri = this.getRedirectUri();
    const scopes = [
      "ZohoBooks.invoices.READ",
      "ZohoBooks.contacts.READ",
      "ZohoBooks.settings.READ",
      "ZohoBooks.items.READ",
      "ZohoBooks.projects.READ",
      "ZohoBooks.fullaccess.READ"
    ].join(',');

    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?` + 
      `scope=${scopes}&` +
      `client_id=${this.config.clientId}&` +
      `response_type=token&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `prompt=consent`;

    this.log(`[AUTH]: Relaying to Zoho OAuth Service...`);
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
        this.fetchOrgProfile();
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
      this.fetchOrgProfile();
      this.fetchLiveModule();
    }
  }

  setConnectedUI(connected) {
    if (connected) {
      this.viewLanding?.classList.add('view-hidden');
      this.viewDashboard?.classList.remove('view-hidden');
      this.statusDot?.classList.replace('bg-red-600', 'bg-green-500');
      if (this.syncStatusText) this.syncStatusText.innerText = "ACTIVE";
    }
  }

  async fetchOrgProfile() {
    if (!this.state.accessToken || !this.config.orgId) return;
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/settings/orgprofile?organization_id=${this.config.orgId}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}` }
      });
      if (response.ok) {
        const result = await response.json();
        this.state.orgData = result.organization;
        this.orgNameBadge.innerText = this.state.orgData.name;
        this.orgNameBadge.classList.remove('view-hidden');
        this.log(`[SYSTEM]: Business Identity Verified: ${this.state.orgData.name}`);
      }
    } catch (e) { this.log("[ERROR]: Could not fetch Org Profile."); }
  }

  logout() {
    localStorage.removeItem('zoho_access_token');
    window.location.reload();
  }

  async fetchLiveModule() {
    if (!this.state.accessToken || !this.config.orgId) return;

    const module = this.state.currentModule;
    this.log(`[DATA]: Synchronizing ${module.toUpperCase()} Ledger...`);
    this.btnSync.disabled = true;
    this.btnSync.innerText = "SYNCING...";

    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?organization_id=${this.config.orgId}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}` }
      });

      if (!response.ok) throw new Error(`API Sync Error: ${response.status}`);

      const result = await response.json();
      this.state.data = result[module] || [];
      this.updateDashboardUI();
      this.log(`[DATA]: Success. Pulled ${this.state.data.length} records.`);
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
      this.metricLabel.innerText = "Cumulative Volume";
      head = `<th class="py-5 px-8">ID</th><th class="py-5">CLIENT</th><th class="py-5">STATUS</th><th class="py-5 text-right px-8">ACTION</th>`;
      body = this.state.data.map((i, idx) => `
        <tr class="hover:bg-white/[0.04] transition-colors group">
          <td class="py-4 px-8 font-mono text-indigo-400 font-bold">${i.invoice_number}</td>
          <td class="py-4 font-bold text-neutral-200">${i.customer_name}</td>
          <td class="py-4"><span class="px-2 py-1 rounded bg-white/5 text-[9px] uppercase font-black text-neutral-400">${i.status}</span></td>
          <td class="py-4 text-right px-8">
            <button onclick="window.app.generateItemStatement(${idx})" class="px-3 py-1 bg-white/5 border border-white/10 rounded text-[9px] font-black hover:bg-indigo-600 hover:border-indigo-600 transition-all uppercase tracking-widest">Statement</button>
          </td>
        </tr>
      `).join('');
    } else if (module === 'contacts') {
      const total = this.state.data.reduce((acc, c) => acc + (c.outstanding_receivable_amount || 0), 0);
      this.statRevenue.innerText = `$${total.toLocaleString()}`;
      this.metricLabel.innerText = "Total Receivables";
      head = `<th class="py-5 px-8">ID</th><th class="py-5">NAME</th><th class="py-5">TYPE</th><th class="py-5 text-right px-8">ACTION</th>`;
      body = this.state.data.map((c, idx) => `
        <tr class="hover:bg-white/[0.04] transition-colors group">
          <td class="py-4 px-8 font-mono text-indigo-400 font-bold">${c.contact_id.toString().slice(-6)}</td>
          <td class="py-4 font-bold text-neutral-200">${c.contact_name}</td>
          <td class="py-4 text-neutral-500 text-xs">${c.contact_type}</td>
          <td class="py-4 text-right px-8">
            <button onclick="window.app.generateItemStatement(${idx})" class="px-3 py-1 bg-white/5 border border-white/10 rounded text-[9px] font-black hover:bg-indigo-600 transition-all uppercase tracking-widest">Statement</button>
          </td>
        </tr>
      `).join('');
    } else if (module === 'projects') {
      this.statRevenue.innerText = this.state.data.length;
      this.metricLabel.innerText = "Active Projects";
      head = `<th class="py-5 px-8">PROJECT NAME</th><th class="py-5">CUSTOMER</th><th class="py-5">STATUS</th><th class="py-5 text-right px-8">ACTION</th>`;
      body = this.state.data.map((p, idx) => `
        <tr class="hover:bg-white/[0.04] transition-colors">
          <td class="py-4 px-8 font-bold text-indigo-400">${p.project_name}</td>
          <td class="py-4 text-neutral-200">${p.customer_name}</td>
          <td class="py-4"><span class="px-2 py-0.5 rounded-full border border-indigo-500/20 text-[8px] uppercase font-bold text-indigo-400">${p.status}</span></td>
          <td class="py-4 text-right px-8">
            <button onclick="window.app.generateItemStatement(${idx})" class="px-3 py-1 bg-white/5 border border-white/10 rounded text-[9px] font-black hover:bg-indigo-600 transition-all uppercase tracking-widest">Details</button>
          </td>
        </tr>
      `).join('');
    } else {
      this.statRevenue.innerText = this.state.data.length;
      this.metricLabel.innerText = "Items in Registry";
      head = `<th class="py-5 px-8">SKU</th><th class="py-5">NAME</th><th class="py-5">STOCK</th><th class="py-5 text-right px-8">ACTION</th>`;
      body = this.state.data.map((item, idx) => `
        <tr class="hover:bg-white/[0.04] transition-colors">
          <td class="py-4 px-8 font-mono text-indigo-400 font-bold">${item.sku || 'N/A'}</td>
          <td class="py-4 font-bold text-neutral-200">${item.name}</td>
          <td class="py-4 font-mono text-neutral-500">${item.stock_on_hand || 0}</td>
          <td class="py-4 text-right px-8">
            <button onclick="window.app.generateItemStatement(${idx})" class="px-3 py-1 bg-white/5 border border-white/10 rounded text-[9px] font-black hover:bg-indigo-600 transition-all uppercase tracking-widest">Analysis</button>
          </td>
        </tr>
      `).join('');
    }

    this.tableHeadRow.innerHTML = head;
    this.tableRecent.innerHTML = body || '<tr><td colspan="4" class="py-20 text-center text-neutral-600 italic">No records retrieved.</td></tr>';
  }

  generateItemStatement(index) {
    const record = this.state.data[index];
    if (!record) return;
    this.state.selectedRecord = record;
    this.switchView('statement');
    this.renderStatement();
  }

  renderStatement() {
    const r = this.state.selectedRecord;
    const org = this.state.orgData || { name: "Insights Pro Enterprise" };
    const module = this.state.currentModule;
    
    let content = `
      <div class="flex justify-between items-start mb-20">
        <div class="space-y-2">
          <h1 class="text-4xl font-black tracking-tighter uppercase text-indigo-600">${module.slice(0,-1)} Statement</h1>
          <p class="text-neutral-500 text-[10px] uppercase tracking-[0.3em] font-bold">Document Generated: ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="text-right">
          <p class="text-xl font-black uppercase">${org.name}</p>
          <p class="text-[9px] text-neutral-500 uppercase tracking-widest mt-1">Zoho Connected Intelligence</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-20 mb-20">
        <div>
          <h4 class="text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-black/5 pb-2 mb-4">Target Identity</h4>
          <p class="text-2xl font-black">${r.customer_name || r.contact_name || r.name || r.project_name}</p>
          <p class="text-sm text-neutral-600 mt-2">${r.email || r.sku || 'Global Identifier: ' + (r.invoice_id || r.contact_id || r.item_id || r.project_id)}</p>
        </div>
        <div>
          <h4 class="text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-black/5 pb-2 mb-4">Financial Overview</h4>
          <div class="space-y-3">
             <div class="flex justify-between">
                <span class="text-sm font-bold text-neutral-500 uppercase">Valuation</span>
                <span class="text-xl font-black">$${(r.total || r.outstanding_receivable_amount || r.rate || 0).toLocaleString()}</span>
             </div>
             <div class="flex justify-between">
                <span class="text-sm font-bold text-neutral-500 uppercase">Current State</span>
                <span class="text-sm font-black uppercase text-indigo-500">${r.status || 'Active'}</span>
             </div>
          </div>
        </div>
      </div>

      <div class="bg-neutral-50 p-10 rounded-2xl border border-black/5">
        <h3 class="text-[10px] font-black uppercase tracking-[0.5em] mb-6 text-neutral-400">Raw Data Matrix</h3>
        <div class="grid grid-cols-2 gap-y-4 gap-x-8">
           ${Object.entries(r).filter(([k, v]) => typeof v !== 'object' && v !== null).map(([key, value]) => `
             <div class="flex flex-col">
                <span class="text-[8px] font-black uppercase text-neutral-400 mb-1">${key.replace(/_/g, ' ')}</span>
                <span class="text-[11px] font-mono font-bold truncate">${value}</span>
             </div>
           `).join('')}
        </div>
      </div>

      <div class="mt-20 pt-10 border-t border-black/5 text-center">
        <p class="text-[9px] text-neutral-400 font-bold uppercase tracking-widest italic">This document is a real-time synthesis of Zoho Books data as of ${new Date().toLocaleTimeString()}</p>
      </div>
    `;

    this.statementCanvas.innerHTML = content;
  }

  printStatement() {
    const filename = `${this.state.currentModule}_${this.state.selectedRecord.invoice_number || this.state.selectedRecord.contact_id}.pdf`;
    html2pdf().from(this.statementCanvas).set({
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).save();
  }

  switchView(viewId) {
    this.state.currentView = viewId;
    document.querySelectorAll('[id^="content-"]').forEach(el => el.classList.add('view-hidden'));
    const target = document.getElementById(`content-${viewId}`);
    if (target) target.classList.remove('view-hidden');
    
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-target') === viewId);
    });
    
    this.viewTitle.innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    
    // UI Logic for different views
    const controls = document.getElementById('main-controls');
    if (viewId === 'statement') controls.classList.add('view-hidden');
    else controls.classList.remove('view-hidden');

    if (viewId === 'reports') this.prepareMasterReport();
  }

  prepareMasterReport() {
    const container = document.getElementById('report-table-container');
    const orgName = this.state.orgData ? this.state.orgData.name : "Zoho Insight Pro";
    document.getElementById('report-org-name').innerText = orgName;
    document.getElementById('report-date').innerText = `SYNTHESIZED: ${new Date().toLocaleString()}`;
    
    container.innerHTML = `
      <div class="space-y-6">
        <p class="text-sm font-bold uppercase tracking-widest text-neutral-400">Ledger Summary: ${this.state.currentModule.toUpperCase()}</p>
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b-2 border-black/10">
              <th class="py-4">Identifier</th>
              <th class="py-4">Primary Subject</th>
              <th class="py-4 text-right">Value</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-black/5">
            ${this.state.data.map(r => `
              <tr>
                <td class="py-3 font-mono text-indigo-600">${r.invoice_number || r.contact_id || r.sku || r.project_id || '--'}</td>
                <td class="py-3 font-bold">${r.customer_name || r.contact_name || r.name || r.project_name}</td>
                <td class="py-3 text-right font-mono font-bold">$${(r.total || r.outstanding_receivable_amount || r.rate || 0).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
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
