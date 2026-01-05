
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
      currentModule: 'invoices' // default
    };

    this.init();
  }

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.handleCallback();
    this.checkSession();
    this.updateRedirectUriDisplay();
  }

  cacheDOM() {
    // Views
    this.viewLanding = document.getElementById('view-landing');
    this.viewDashboard = document.getElementById('view-dashboard');
    this.viewTitle = document.getElementById('view-title');
    this.viewSubtitle = document.getElementById('view-subtitle');
    
    // Core Buttons
    this.btnConnect = document.getElementById('btn-connect');
    this.btnSync = document.getElementById('btn-sync');
    this.btnGeneratePdf = document.getElementById('btn-generate-pdf');
    this.btnLogout = document.getElementById('btn-logout');
    
    // Modals & Logs
    this.modalConfig = document.getElementById('modal-config');
    this.datasetLog = document.getElementById('dataset-log');
    this.displayUri = document.getElementById('display-uri');
    this.statusDot = document.getElementById('status-dot');
    this.syncStatusText = document.getElementById('sync-status');
    
    // Config controls
    this.btnOpenConfigLanding = document.getElementById('btn-open-config-landing');
    this.btnOpenConfigSidebar = document.getElementById('btn-open-config-sidebar');
    this.btnCloseConfig = document.getElementById('btn-close-config');
    this.btnSaveConfig = document.getElementById('btn-save-config');
    this.btnCopyUri = document.getElementById('btn-copy-uri');
    this.btnClearLogs = document.getElementById('btn-clear-logs');
    
    // Data elements
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

    // Config
    this.btnOpenConfigLanding?.addEventListener('click', () => this.toggleConfig(true));
    this.btnOpenConfigSidebar?.addEventListener('click', () => this.toggleConfig(true));
    this.btnCloseConfig?.addEventListener('click', () => this.toggleConfig(false));
    this.btnSaveConfig?.addEventListener('click', () => this.saveConfig());
    this.btnCopyUri?.addEventListener('click', () => this.copyUriToClipboard());

    // Navigation
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-target');
        this.switchView(target);
      });
    });

    // Module Selector
    this.moduleSelector?.addEventListener('change', (e) => {
      this.state.currentModule = e.target.value;
      this.log(`Module changed to: ${this.state.currentModule.toUpperCase()}`);
    });
  }

  updateRedirectUriDisplay() {
    if (this.displayUri) {
      // Robust URI detection: ensures we don't include hash fragments or trailing slashes inconsistently
      const cleanUri = window.location.origin + window.location.pathname;
      this.displayUri.innerText = cleanUri;
    }
  }

  copyUriToClipboard() {
    const uri = this.displayUri.innerText;
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
    this.log(`Configuration successfully updated for ${this.config.region.toUpperCase()} region.`);
  }

  startAuth() {
    if (!this.config.clientId) {
      alert("Missing Configuration: Enter your Zoho Client ID in Settings first.");
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

    this.log(`Redirecting to Zoho Identity Server [${this.config.region}]...`);
    window.location.href = authUrl;
  }

  handleCallback() {
    // Zoho Implicit Grant returns data in the hash #
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const token = hashParams.get('access_token');
    
    if (token) {
      this.state.accessToken = token;
      localStorage.setItem('zoho_access_token', token);
      // Strip hash from URL for a clean state
      window.history.replaceState({}, document.title, window.location.pathname);
      this.setConnectedUI(true);
      this.log("OAuth Session Established. Credentials validated.");
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
      this.statusDot?.classList.add('shadow-[0_0_10px_rgba(34,197,94,0.5)]');
      if (this.syncStatusText) this.syncStatusText.innerText = "ACTIVE";
      if (this.viewSubtitle) this.viewSubtitle.innerText = `Connected to Org: ${this.config.orgId}`;
    }
  }

  logout() {
    localStorage.removeItem('zoho_access_token');
    this.log("Security: Session terminated. Local buffer cleared.");
    window.location.reload();
  }

  // --- DATA OPERATIONS ---

  async fetchLiveModule() {
    if (!this.state.accessToken) return;
    if (!this.config.orgId) {
      this.log("Error: Organization ID missing in settings.");
      this.toggleConfig(true);
      return;
    }

    const module = this.state.currentModule;
    this.log(`Inbound Request: Fetching ${module.toUpperCase()} from Zoho...`);
    this.btnSync.disabled = true;
    this.btnSync.innerText = "REFRESHING...";

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
        throw new Error(errorData.message || `API Status ${response.status}`);
      }

      const result = await response.json();
      
      // Determine key based on module
      // Zoho API returns { invoices: [...] } or { contacts: [...] } etc
      this.state.data = result[module] || [];
      this.updateDashboardUI();
      this.log(`Success: Ingested ${this.state.data.length} records.`);
    } catch (err) {
      this.log(`CRITICAL API ERROR: ${err.message}`);
      if (err.message.toLowerCase().includes('token') || err.message.includes('401')) {
        this.log("Security: Access token invalid/expired. Re-authentication required.");
      }
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
      headHTML = `<th class="py-5 px-8">INV #</th><th class="py-5">CUSTOMER</th><th class="py-5">STATUS</th><th class="py-5 text-right px-8">TOTAL</th>`;
      tableHTML = this.state.data.map(inv => `
        <tr class="hover:bg-white/[0.04] transition-colors">
          <td class="py-5 px-8 font-mono text-[11px] text-indigo-400 font-bold">${inv.invoice_number}</td>
          <td class="py-5 font-bold">${inv.customer_name}</td>
          <td class="py-5"><span class="px-2 py-1 rounded text-[9px] font-black uppercase bg-white/10">${inv.status}</span></td>
          <td class="py-5 text-right font-mono font-bold px-8">$${(inv.total || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    } else if (module === 'contacts') {
      totalValue = this.state.data.length; // Count for contacts
      this.metricLabel.innerText = "Total Database Count";
      headHTML = `<th class="py-5 px-8">CONTACT ID</th><th class="py-5">NAME / COMPANY</th><th class="py-5">CURRENCY</th><th class="py-5 text-right px-8">BALANCE</th>`;
      tableHTML = this.state.data.map(c => `
        <tr class="hover:bg-white/[0.04] transition-colors">
          <td class="py-5 px-8 font-mono text-[11px] text-indigo-400 font-bold">${c.contact_id}</td>
          <td class="py-5 font-bold">${c.contact_name}</td>
          <td class="py-5 text-xs text-neutral-500">${c.currency_code}</td>
          <td class="py-5 text-right font-mono font-bold px-8">$${(c.outstanding_receivable_amount || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    } else if (module === 'items') {
      totalValue = this.state.data.length;
      this.metricLabel.innerText = "Unique Inventory SKUs";
      headHTML = `<th class="py-5 px-8">SKU / ID</th><th class="py-5">PRODUCT NAME</th><th class="py-5">STOCK</th><th class="py-5 text-right px-8">UNIT RATE</th>`;
      tableHTML = this.state.data.map(i => `
        <tr class="hover:bg-white/[0.04] transition-colors">
          <td class="py-5 px-8 font-mono text-[11px] text-indigo-400 font-bold">${i.sku || i.item_id}</td>
          <td class="py-5 font-bold">${i.name}</td>
          <td class="py-5 text-xs">${i.stock_on_hand || 0} units</td>
          <td class="py-5 text-right font-mono font-bold px-8">$${(i.rate || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    }

    this.statRevenue.innerText = module === 'invoices' ? `$${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}` : totalValue;
    this.tableHeadRow.innerHTML = headHTML;
    this.tableRecent.innerHTML = tableHTML || `<tr><td colspan="4" class="py-24 text-center text-neutral-700 italic">No records returned from this module.</td></tr>`;
  }

  // --- VIEW MANAGEMENT ---

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
    console.log(`[ZOHO INSIGHT]: ${msg}`);
  }

  clearLogs() {
    if (this.datasetLog) this.datasetLog.innerHTML = '<div class="text-neutral-700 italic">--- Buffer Cleared ---</div>';
  }

  prepareReport() {
    const reportDate = document.getElementById('report-date');
    if (reportDate) reportDate.innerText = `TIMESTAMP: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}`;
    
    const container = document.getElementById('report-table-container');
    const module = this.state.currentModule;
    
    container.innerHTML = `
      <h2 class="text-xl font-black mb-6 uppercase tracking-widest text-indigo-400">MODULE: ${module}</h2>
      <table class="w-full text-left text-[11px] mt-10 border-t border-white/10">
        <thead>
          <tr class="text-neutral-500 font-black">
            <th class="py-4">ENTITY ID</th>
            <th class="py-4">CORE ATTRIBUTE</th>
            <th class="py-4 text-right">FINANCIAL METRIC</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          ${this.state.data.map(d => `
            <tr>
              <td class="py-4 text-neutral-500 font-mono">${d.invoice_number || d.contact_id || d.item_id}</td>
              <td class="py-4 font-bold uppercase">${d.customer_name || d.contact_name || d.name}</td>
              <td class="py-4 text-right font-mono font-bold">$${(d.total || d.outstanding_receivable_amount || d.rate || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  generatePDF() {
    const element = document.getElementById('report-template');
    const moduleName = this.state.currentModule;
    this.btnGeneratePdf.innerText = "SYNTHESIZING ASSETS...";
    
    html2pdf().set({
      margin: 0.5,
      filename: `Zoho_${moduleName}_Report_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 3, backgroundColor: '#050505', logging: false },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(element).save().then(() => {
      this.btnGeneratePdf.innerText = "SYNTHESIZE PDF REPORT";
    });
  }
}

// Initializing strictly via window to ensure it's accessible but programmatically bound
window.app = new ZohoInsightApp();
