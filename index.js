
/**
 * ZOHO INSIGHT PRO - ADVANCED ENTERPRISE ENGINE
 * Pure Vanilla JS Implementation
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

    // Ensure DOM is ready before init
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.handleCallback();
    this.checkSession();
    this.updateRedirectUriDisplay();
    this.log("System Initialized. Ready for configuration.");
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
    this.statusDot = document.getElementById('status-dot');
    this.syncStatusText = document.getElementById('sync-status');
    
    this.btnOpenConfigLanding = document.getElementById('btn-open-config-landing');
    this.btnOpenConfigSidebar = document.getElementById('btn-open-config-sidebar');
    this.btnCloseConfig = document.getElementById('btn-close-config');
    this.btnSaveConfig = document.getElementById('btn-save-config');
    this.btnCopyUri = document.getElementById('btn-copy-uri');
    this.btnClearLogs = document.getElementById('btn-clear-logs');
    
    this.tableRecent = document.getElementById('table-recent');
    this.tableHeadRow = document.getElementById('table-head-row');
    this.statRevenue = document.getElementById('stat-revenue');
    this.statPending = document.getElementById('stat-pending');
    this.metricLabel = document.getElementById('metric-label');
    this.moduleSelector = document.getElementById('data-module-selector');
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
    this.btnCopyUri?.addEventListener('click', () => this.copyUriToClipboard());

    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-target');
        this.switchView(target);
      });
    });

    this.moduleSelector?.addEventListener('change', (e) => {
      this.state.currentModule = e.target.value;
      this.log(`Switched Data Source to: ${this.state.currentModule.toUpperCase()}`);
      if (this.state.accessToken) this.fetchLiveModule();
    });
  }

  updateRedirectUriDisplay() {
    // Force immediate detection
    const cleanUri = window.location.origin + window.location.pathname;
    if (this.displayUri) {
      this.displayUri.innerText = cleanUri;
    }
  }

  copyUriToClipboard() {
    const uri = window.location.origin + window.location.pathname;
    navigator.clipboard.writeText(uri).then(() => {
      const originalText = this.btnCopyUri.innerText;
      this.btnCopyUri.innerText = "COPIED!";
      this.btnCopyUri.classList.replace('bg-indigo-600', 'bg-green-600');
      setTimeout(() => {
        this.btnCopyUri.innerText = originalText;
        this.btnCopyUri.classList.replace('bg-green-600', 'bg-indigo-600');
      }, 2000);
    });
  }

  // --- OAUTH LOGIC ---

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
      alert("Configuration Error: Client ID is missing. Please go to Settings.");
      this.toggleConfig(true);
      return;
    }

    const scopes = [
      "ZohoBooks.invoices.READ",
      "ZohoBooks.contacts.READ",
      "ZohoBooks.settings.READ",
      "ZohoBooks.items.READ"
    ].join(',');

    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?` + 
      `scope=${scopes}&` +
      `client_id=${this.config.clientId}&` +
      `response_type=token&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `prompt=consent`;

    this.log(`[AUTH]: Redirecting to Zoho (${this.config.region})...`);
    this.log(`[AUTH]: URI sent to Zoho: ${redirectUri}`);
    this.log(`[AUTH]: Client ID used: ${this.config.clientId}`);
    
    // Slight delay to allow user to read logs if they are on the Dashboard
    window.location.href = authUrl;
  }

  handleCallback() {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const token = hashParams.get('access_token');
    
    if (token) {
      this.state.accessToken = token;
      localStorage.setItem('zoho_access_token', token);
      window.history.replaceState({}, document.title, window.location.pathname);
      this.setConnectedUI(true);
      this.log("[AUTH]: Success. Token received.");
      this.fetchLiveModule();
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
      if (this.syncStatusText) this.syncStatusText.innerText = "CONNECTED";
      if (this.viewSubtitle) this.viewSubtitle.innerText = `Organization Context: ${this.config.orgId}`;
    }
  }

  logout() {
    localStorage.removeItem('zoho_access_token');
    window.location.reload();
  }

  // --- DATA OPERATIONS ---

  async fetchLiveModule() {
    if (!this.state.accessToken) return;
    if (!this.config.orgId) {
      this.log("[DATA]: Error - Organization ID is missing.");
      return;
    }

    const module = this.state.currentModule;
    this.log(`[DATA]: Synchronizing ${module.toUpperCase()}...`);
    this.btnSync.disabled = true;
    this.btnSync.innerText = "FETCHING...";

    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?organization_id=${this.config.orgId}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      this.state.data = result[module] || [];
      this.updateDashboardUI();
      this.log(`[DATA]: Success. ${this.state.data.length} records ingested.`);
    } catch (err) {
      this.log(`[ERROR]: API Request failed: ${err.message}`);
    } finally {
      this.btnSync.disabled = false;
      this.btnSync.innerText = "REFRESH LIVE";
    }
  }

  updateDashboardUI() {
    const module = this.state.currentModule;
    let totalValue = 0;
    let tableHTML = "";
    let headHTML = "";

    this.statPending.innerText = this.state.data.length;

    if (module === 'invoices') {
      totalValue = this.state.data.reduce((acc, inv) => acc + (inv.total || 0), 0);
      this.metricLabel.innerText = "Gross Receivables";
      headHTML = `<th class="py-5 px-8">ID</th><th class="py-5">ENTITY</th><th class="py-5">STATUS</th><th class="py-5 text-right px-8">TOTAL</th>`;
      tableHTML = this.state.data.map(inv => `
        <tr class="hover:bg-white/[0.04]">
          <td class="py-5 px-8 font-mono text-[11px] text-indigo-400 font-bold">${inv.invoice_number}</td>
          <td class="py-5 font-bold">${inv.customer_name}</td>
          <td class="py-5"><span class="px-2 py-1 rounded text-[9px] font-black uppercase bg-white/10">${inv.status}</span></td>
          <td class="py-5 text-right font-mono font-bold px-8">$${(inv.total || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    } else if (module === 'contacts') {
      totalValue = this.state.data.length;
      this.metricLabel.innerText = "Customer Database";
      headHTML = `<th class="py-5 px-8">CONTACT ID</th><th class="py-5">NAME / COMPANY</th><th class="py-5">CURRENCY</th><th class="py-5 text-right px-8">OUTSTANDING</th>`;
      tableHTML = this.state.data.map(c => `
        <tr class="hover:bg-white/[0.04]">
          <td class="py-5 px-8 font-mono text-[11px] text-indigo-400 font-bold">${c.contact_id}</td>
          <td class="py-5 font-bold">${c.contact_name}</td>
          <td class="py-5 text-xs text-neutral-500">${c.currency_code}</td>
          <td class="py-5 text-right font-mono font-bold px-8">$${(c.outstanding_receivable_amount || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    } else if (module === 'items') {
      totalValue = this.state.data.length;
      this.metricLabel.innerText = "Product SKUs";
      headHTML = `<th class="py-5 px-8">SKU / ID</th><th class="py-5">ITEM NAME</th><th class="py-5">AVAILABILITY</th><th class="py-5 text-right px-8">UNIT PRICE</th>`;
      tableHTML = this.state.data.map(i => `
        <tr class="hover:bg-white/[0.04]">
          <td class="py-5 px-8 font-mono text-[11px] text-indigo-400 font-bold">${i.sku || i.item_id}</td>
          <td class="py-5 font-bold">${i.name}</td>
          <td class="py-5 text-xs">${i.stock_on_hand || 0} units</td>
          <td class="py-5 text-right font-mono font-bold px-8">$${(i.rate || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    }

    this.statRevenue.innerText = module === 'invoices' ? `$${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}` : totalValue;
    this.tableHeadRow.innerHTML = headHTML;
    this.tableRecent.innerHTML = tableHTML || `<tr><td colspan="4" class="py-24 text-center text-neutral-700 italic">No records found.</td></tr>`;
  }

  switchView(viewId) {
    this.state.currentView = viewId;
    document.querySelectorAll('[id^="content-"]').forEach(el => el.classList.add('view-hidden'));
    document.getElementById(`content-${viewId}`).classList.remove('view-hidden');
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-target') === viewId);
    });
    this.viewTitle.innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    if (viewId === 'reports') this.prepareReport();
  }

  log(msg) {
    if (!this.datasetLog) return;
    const time = new Date().toLocaleTimeString();
    this.datasetLog.innerHTML += `<div><span class="text-neutral-600">[${time}]</span> <span class="text-white">${msg}</span></div>`;
    this.datasetLog.scrollTop = this.datasetLog.scrollHeight;
  }

  clearLogs() {
    if (this.datasetLog) this.datasetLog.innerHTML = '';
  }

  prepareReport() {
    const reportDate = document.getElementById('report-date');
    if (reportDate) reportDate.innerText = `TIMESTAMP: ${new Date().toISOString()}`;
    const container = document.getElementById('report-table-container');
    container.innerHTML = `<p class="text-neutral-400">Analysis for module: <strong>${this.state.currentModule}</strong>. Found ${this.state.data.length} records.</p>`;
  }

  generatePDF() {
    const element = document.getElementById('report-template');
    this.btnGeneratePdf.innerText = "GENERATING...";
    html2pdf().from(element).save().then(() => {
      this.btnGeneratePdf.innerText = "SYNTHESIZE PDF REPORT";
    });
  }
}

// Global initialization
window.app = new ZohoInsightApp();
