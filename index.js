
/**
 * BIZSENSE STATEMENT PRO - ENGINE CORE
 * Fully Generic Version: Advanced Session Management
 */

class ZohoLedgerApp {
  constructor() {
    this.proxyPrefix = "https://corsproxy.io/?";
    
    // 1. Initial Config Load
    const savedConfig = localStorage.getItem('zoho_config');
    this.config = savedConfig ? JSON.parse(savedConfig) : { clientId: '', clientSecret: '', region: 'com' };
    
    this.themes = {
      indigo: { primary: '#6366f1', secondary: '#f5f3ff', accent: '#818cf8', text: '#1e1b4b', border: '#e2e8f0' }
    };

    this.state = {
      accessToken: localStorage.getItem('zoho_access_token'),
      organizations: [],
      selectedOrgId: localStorage.getItem('zoho_selected_org_id'),
      currentOrgDetails: null,
      customers: [],
      selectedCustomerIds: new Set(),
      activeModules: new Set(JSON.parse(localStorage.getItem('active_modules')) || ['invoices']), 
      dataStore: { invoices: {}, estimates: {}, salesorders: {}, creditnotes: {} },
      invoiceDetailsCache: {},
      currentView: 'ledger', 
      currentTheme: 'indigo',
      zoom: 1.0,
      isInitializing: true
    };

    // 2. Immediate Callback Check (Run before DOM for speed)
    this.handleOAuthCallback();
    
    // 3. Start App
    this.init();
  }

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.applyTheme(this.state.currentTheme);
    this.updateConfigStatus();
    this.checkSession();
    window.addEventListener('resize', () => { if(this.state.currentView === 'ledger') this.autoFitZoom(); });
  }

  cacheDOM() {
    this.views = {
      landing: document.getElementById('view-landing'),
      dashboard: document.getElementById('view-dashboard'),
      configModal: document.getElementById('modal-config'),
      settingsModal: document.getElementById('modal-settings'),
      loadingBar: document.getElementById('loading-bar-container'),
      loadingOverlay: document.getElementById('loading-status-overlay'),
      loadingProgress: document.getElementById('loading-bar'),
      loadingText: document.getElementById('loading-bar-text'),
      landingError: document.getElementById('landing-error'),
      customerList: document.getElementById('customer-list'),
      areaLedger: document.getElementById('area-ledger'),
      areaExplorer: document.getElementById('area-explorer'),
      statementContainer: document.getElementById('statement-render-target'),
      configStatus: document.getElementById('config-status-badge')
    };
    
    this.inputs = {
      orgSelect: document.getElementById('select-organization'),
      search: document.getElementById('customer-search'),
      clientId: document.getElementById('cfg-client-id'),
      clientSecret: document.getElementById('cfg-client-secret'),
      region: document.getElementById('cfg-region'),
      displayRedirect: document.getElementById('display-redirect-uri'),
      moduleCheckboxes: document.querySelectorAll('#module-selector input')
    };

    this.btns = {
      connect: document.getElementById('btn-connect'),
      saveConfig: document.getElementById('btn-save-config'),
      copyUri: document.getElementById('btn-copy-uri'),
      resetConfig: document.getElementById('btn-reset-config'),
      download: document.getElementById('btn-download-pdf'),
      logout: document.getElementById('btn-logout'),
      selectAll: document.getElementById('btn-select-all'),
      clearAll: document.getElementById('btn-clear-all'),
      openConfigLanding: document.getElementById('btn-open-config-landing'),
      closeConfig: document.getElementById('btn-close-config'),
      tabLedger: document.getElementById('tab-ledger'),
      tabExplorer: document.getElementById('tab-explorer'),
      openSettings: document.getElementById('btn-project-settings'),
      closeSettings: document.getElementById('btn-close-settings'),
      applySettings: document.getElementById('btn-apply-settings'),
      zoomIn: document.getElementById('btn-zoom-in'),
      zoomOut: document.getElementById('btn-zoom-out'),
      zoomFit: document.getElementById('btn-zoom-fit')
    };

    this.targets = {
      renderArea: document.getElementById('statement-render-target'),
      explorerArea: document.getElementById('explorer-render-target'),
      explorerTabs: document.getElementById('explorer-module-tabs'),
      emptyState: document.getElementById('empty-state'),
      log: document.getElementById('log-message'),
      landingErrorText: document.getElementById('landing-error-text')
    };

    if (this.inputs.displayRedirect) {
      this.inputs.displayRedirect.innerText = window.location.origin + window.location.pathname;
    }

    this.inputs.moduleCheckboxes.forEach(cb => {
      cb.checked = this.state.activeModules.has(cb.value);
    });
  }

  bindEvents() {
    if (this.btns.connect) this.btns.connect.onclick = () => this.startAuth();
    if (this.btns.saveConfig) this.btns.saveConfig.onclick = () => this.saveConfig();
    if (this.btns.copyUri) this.btns.copyUri.onclick = () => this.copyToClipboard(this.inputs.displayRedirect.innerText);
    if (this.btns.resetConfig) this.btns.resetConfig.onclick = () => this.wipeConfiguration();
    if (this.btns.openConfigLanding) this.btns.openConfigLanding.onclick = () => this.toggleModal(true);
    if (this.btns.closeConfig) this.btns.closeConfig.onclick = () => this.toggleModal(false);
    if (this.btns.logout) this.btns.logout.onclick = () => this.logout();
    if (this.btns.download) this.btns.download.onclick = () => this.downloadPDF();
    if (this.btns.selectAll) this.btns.selectAll.onclick = () => this.toggleAllCustomers(true);
    if (this.btns.clearAll) this.btns.clearAll.onclick = () => this.toggleAllCustomers(false);

    if (this.btns.openSettings) this.btns.openSettings.onclick = () => this.views.settingsModal.classList.remove('view-hidden');
    if (this.btns.closeSettings) this.btns.closeSettings.onclick = () => this.views.settingsModal.classList.add('view-hidden');
    if (this.btns.applySettings) this.btns.applySettings.onclick = () => {
      this.state.activeModules.clear();
      this.inputs.moduleCheckboxes.forEach(cb => {
        if (cb.checked) this.state.activeModules.add(cb.value);
      });
      localStorage.setItem('active_modules', JSON.stringify(Array.from(this.state.activeModules)));
      this.views.settingsModal.classList.add('view-hidden');
      this.syncAllActiveCustomers();
    };

    if (this.btns.tabLedger) this.btns.tabLedger.onclick = () => this.switchView('ledger');
    if (this.btns.tabExplorer) this.btns.tabExplorer.onclick = () => this.switchView('explorer');

    if (this.btns.zoomIn) this.btns.zoomIn.onclick = () => this.setZoom(this.state.zoom + 0.1);
    if (this.btns.zoomOut) this.btns.zoomOut.onclick = () => this.setZoom(this.state.zoom - 0.1);
    if (this.btns.zoomFit) this.btns.zoomFit.onclick = () => this.autoFitZoom();

    if (this.inputs.search) this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
    
    if (this.inputs.orgSelect) {
      this.inputs.orgSelect.onchange = (e) => {
        this.state.selectedOrgId = e.target.value;
        localStorage.setItem('zoho_selected_org_id', e.target.value);
        this.clearDataStore();
        this.fetchOrganizationDetails();
        this.syncAllActiveCustomers();
      };
    }
  }

  handleOAuthCallback() {
    const hash = window.location.hash;
    const search = window.location.search;
    
    // Priority 1: Check for tokens in hash (Implicit Flow)
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      if (token) {
        this.state.accessToken = token;
        localStorage.setItem('zoho_access_token', token);
        // Clean the URL for security/aesthetics
        window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
      }
    } 
    // Priority 2: Check for errors in search (Query parameters)
    else if (search && search.includes('error')) {
      const params = new URLSearchParams(search);
      const errorMsg = params.get('error');
      let helpText = `OAuth Error: ${errorMsg}`;
      
      if (errorMsg === 'invalid_client') {
        helpText = `Client ID mismatch. Ensure your Zoho API Console region matches the one selected in this app. Only "Single Page Application" client types are supported.`;
      } else if (errorMsg === 'access_denied') {
        helpText = "Access request was cancelled.";
      }
      
      this.showLandingError(helpText);
      window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
    }
  }

  async checkSession() {
    if (this.state.accessToken) {
      this.showLoading(20, "Establishing Secure Connection...");
      try {
        const success = await this.discoverOrganizations();
        if (success) {
          this.views.landing.classList.add('view-hidden');
          this.views.dashboard.classList.remove('view-hidden');
          await this.fetchOrganizationDetails();
          await this.fetchCustomers();
          this.autoFitZoom();
          this.log("Session Verified.");
        } else {
          // Failure handled in discoverOrganizations (shows error on landing)
          this.hideLoading();
        }
      } catch (err) {
        this.showLandingError(`Initialization Failure: ${err.message}`);
        this.hideLoading();
      }
    }
    this.state.isInitializing = false;
  }

  async discoverOrganizations() {
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/organizations`;
      const res = await this.rawRequest(url);
      
      if (res && res.organizations && res.organizations.length > 0) {
        this.state.organizations = res.organizations;
        this.inputs.orgSelect.innerHTML = '';
        res.organizations.forEach(org => {
          const opt = document.createElement('option');
          opt.value = org.organization_id;
          opt.innerText = org.name;
          this.inputs.orgSelect.appendChild(opt);
        });
        
        if (!this.state.selectedOrgId) {
          this.state.selectedOrgId = res.organizations[0].organization_id;
        }
        this.inputs.orgSelect.value = this.state.selectedOrgId;
        return true;
      } else {
        throw new Error("No organizations found associated with this Zoho account.");
      }
    } catch (e) {
      if (e.message.includes("401") || e.message.includes("Invalid Token")) {
        this.showLandingError("Session expired or token invalid. Please Authorize again.");
        this.logout(false); // don't reload to avoid loops
      } else {
        this.showLandingError(`Data Center Mismatch? Failed to fetch organizations from zoho.${this.config.region}. Error: ${e.message}`);
      }
      return false;
    }
  }

  async rawRequest(url) {
    const fullUrl = this.proxyPrefix + encodeURIComponent(url);
    try {
      const res = await fetch(fullUrl, {
        method: 'GET',
        headers: { 
          'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        }
      });
      
      if (res.status === 401) throw new Error("401 Unauthorized (Invalid Session)");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
      }
      
      return await res.json();
    } catch (err) {
      console.error("API Fetch Error:", err);
      throw err;
    }
  }

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.btns.copyUri.innerText = "COPIED!";
      this.btns.copyUri.classList.add('bg-green-600', 'text-white');
      setTimeout(() => {
        this.btns.copyUri.innerText = "COPY URI";
        this.btns.copyUri.classList.remove('bg-green-600', 'text-white');
      }, 2000);
    } catch (err) {
      alert("Manual copy required: " + text);
    }
  }

  updateConfigStatus() {
    if (!this.config.clientId || this.config.clientId.length < 5) {
      this.views.configStatus.classList.remove('view-hidden');
      this.btns.connect.classList.add('opacity-40', 'cursor-not-allowed');
    } else {
      this.views.configStatus.classList.add('view-hidden');
      this.btns.connect.classList.remove('opacity-40', 'cursor-not-allowed');
    }
  }

  wipeConfiguration() {
    if (confirm("This will clear ALL settings and active sessions. Continue?")) {
      localStorage.clear();
      window.location.hash = '';
      window.location.reload();
    }
  }

  setZoom(val) {
    this.state.zoom = Math.max(0.1, Math.min(3.0, val));
    if (this.views.statementContainer) {
      this.views.statementContainer.style.transform = `scale(${this.state.zoom})`;
    }
  }

  autoFitZoom() {
    const wrapper = this.views.areaLedger;
    if (!wrapper) return;
    const w = wrapper.clientWidth - 80;
    const targetW = 21 * 37.8; 
    this.setZoom(w / targetW);
  }

  applyTheme(themeKey) {
    const theme = this.themes[themeKey];
    document.documentElement.style.setProperty('--theme-primary', theme.primary);
    document.documentElement.style.setProperty('--theme-secondary', theme.secondary);
    document.documentElement.style.setProperty('--theme-accent', theme.accent);
  }

  clearDataStore() {
    this.state.dataStore = { invoices: {}, estimates: {}, salesorders: {}, creditnotes: {} };
    this.state.invoiceDetailsCache = {};
  }

  switchView(v) {
    this.state.currentView = v;
    this.views.areaLedger.classList.toggle('view-hidden', v !== 'ledger');
    this.views.areaExplorer.classList.toggle('view-hidden', v !== 'explorer');
    
    this.btns.tabLedger.classList.toggle('bg-indigo-600', v === 'ledger');
    this.btns.tabLedger.classList.toggle('text-white', v === 'ledger');
    this.btns.tabLedger.classList.toggle('text-neutral-500', v !== 'ledger');
    
    this.btns.tabExplorer.classList.toggle('bg-indigo-600', v === 'explorer');
    this.btns.tabExplorer.classList.toggle('text-white', v === 'explorer');
    this.btns.tabExplorer.classList.toggle('text-neutral-500', v !== 'explorer');

    if (v === 'explorer') this.renderExplorer();
    else this.autoFitZoom();
  }

  toggleModal(show) {
    this.views.configModal.classList.toggle('view-hidden', !show);
    if (show) {
      this.inputs.clientId.value = this.config.clientId || '';
      this.inputs.clientSecret.value = this.config.clientSecret || '';
      this.inputs.region.value = this.config.region || 'com';
    }
  }

  saveConfig() {
    const cid = this.inputs.clientId.value.trim();
    if (!cid) return alert("Client ID is required.");
    
    this.config = { 
      clientId: cid, 
      clientSecret: this.inputs.clientSecret.value.trim(), 
      region: this.inputs.region.value 
    };
    
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.toggleModal(false);
    this.updateConfigStatus();
    this.log("Settings Saved.");
    this.views.landingError.classList.add('view-hidden');
  }

  startAuth() {
    if (!this.config.clientId || this.config.clientId.length < 5) {
      return this.toggleModal(true);
    }
    
    this.showLoading(15, "Initiating OAuth Handshake...");
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.estimates.READ,ZohoBooks.salesorders.READ,ZohoBooks.creditnotes.READ,ZohoBooks.settings.READ";
    
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent`;
    
    window.location.href = authUrl;
  }

  async fetchOrganizationDetails() {
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/settings/organization?organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.organization) this.state.currentOrgDetails = res.organization;
    } catch (e) { console.warn("Detail fetch skip", e); }
  }

  async fetchCustomers() {
    this.showLoading(40, "Synchronizing Customers...");
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/contacts?contact_type=customer&status=active&organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.contacts) {
        this.state.customers = res.contacts;
        this.renderCustomerList();
        this.log("Registry Online.");
      }
    } catch (e) { this.log(`API Error: ${e.message}`); }
    finally { this.hideLoading(); }
  }

  renderCustomerList() {
    this.views.customerList.innerHTML = '';
    this.state.customers.sort((a,b) => a.contact_name.localeCompare(b.contact_name)).forEach(c => {
      const isSelected = this.state.selectedCustomerIds.has(c.contact_id);
      const div = document.createElement('div');
      div.className = `flex items-center space-x-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-all group ${isSelected ? 'bg-indigo-500/10 border border-indigo-500/20' : 'border border-transparent'}`;
      div.innerHTML = `
        <div class="w-4 h-4 rounded border border-white/20 flex items-center justify-center group-hover:border-indigo-500 ${isSelected ? 'bg-indigo-500 border-indigo-500' : ''}">
          ${isSelected ? '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
        </div>
        <span class="truncate font-black uppercase text-[9px] text-neutral-400 group-hover:text-white transition-colors tracking-widest">${c.contact_name}</span>
      `;
      div.onclick = () => this.handleCustomerClick(c.contact_id);
      this.views.customerList.appendChild(div);
    });
  }

  async handleCustomerClick(id) {
    if (this.state.selectedCustomerIds.has(id)) {
      this.state.selectedCustomerIds.delete(id);
      Object.keys(this.state.dataStore).forEach(mod => delete this.state.dataStore[mod][id]);
    } else {
      this.state.selectedCustomerIds.add(id);
      await this.syncCustomerData(id);
    }
    this.renderCustomerList();
    this.recalculateAndRender();
    this.autoFitZoom();
  }

  async syncCustomerData(id) {
    const customer = this.state.customers.find(c => c.contact_id === id);
    if (!customer) return;
    
    this.showLoading(50, `Pulling Data: ${customer.contact_name}`);
    for (const module of this.state.activeModules) {
      try {
        const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?customer_id=${id}&organization_id=${this.state.selectedOrgId}`;
        const res = await this.rawRequest(url);
        const records = res[module] || [];

        if (module === 'invoices' && records.length > 0) {
          for (const inv of records) {
            if (!this.state.invoiceDetailsCache[inv.invoice_id]) {
              await new Promise(r => setTimeout(r, 60)); 
              const dUrl = `https://www.zohoapis.${this.config.region}/books/v3/invoices/${inv.invoice_id}?organization_id=${this.state.selectedOrgId}`;
              try {
                const dRes = await this.rawRequest(dUrl);
                if (dRes && dRes.invoice) this.state.invoiceDetailsCache[inv.invoice_id] = dRes.invoice;
              } catch (e) { console.warn("Detail sync skip", e); }
            }
          }
        }
        this.state.dataStore[module][id] = { customerName: customer.contact_name, records: records };
      } catch (e) { console.warn("Module sync error", e); }
    }
    this.hideLoading();
  }

  async syncAllActiveCustomers() {
    this.clearDataStore();
    for (const id of Array.from(this.state.selectedCustomerIds)) await this.syncCustomerData(id);
    this.recalculateAndRender();
    this.autoFitZoom();
  }

  toggleAllCustomers(selected) {
    if (selected) {
      this.state.customers.forEach(c => this.state.selectedCustomerIds.add(c.contact_id));
      this.syncAllActiveCustomers();
    } else {
      this.state.selectedCustomerIds.clear();
      this.clearDataStore();
      this.recalculateAndRender();
    }
    this.renderCustomerList();
  }

  recalculateAndRender() {
    this.state.statementData = [];
    this.state.selectedCustomerIds.forEach(id => {
      const invData = this.state.dataStore.invoices[id];
      if (invData && invData.records.length > 0) {
        const groupedInvoices = [];
        invData.records.forEach(inv => {
          const fullInv = this.state.invoiceDetailsCache[inv.invoice_id];
          const items = [];
          if (fullInv && fullInv.line_items) {
            fullInv.line_items.forEach(li => {
              items.push({ itemName: li.name || li.description || "Service", qty: li.quantity || 1, subTotal: li.item_total || 0 });
            });
          } else {
            items.push({ itemName: `Pending detail sync...`, qty: 1, subTotal: inv.total || 0 });
          }
          groupedInvoices.push({ invoiceNo: inv.invoice_number, date: inv.date, balance: inv.balance, items: items });
        });
        this.state.statementData.push({ customerName: invData.customerName, invoices: groupedInvoices });
      }
    });

    if (this.state.currentView === 'ledger') this.renderStatementUI();
    else this.renderExplorer();
  }

  renderExplorer() {
    const mods = Object.keys(this.state.dataStore).filter(m => Object.values(this.state.dataStore[m]).some(d => d.records.length > 0));
    if (mods.length === 0) {
      this.targets.explorerArea.innerHTML = '<div class="h-40 flex items-center justify-center text-neutral-600 text-[10px] font-black uppercase tracking-widest">No Active Records</div>';
      return;
    }
    if (!this.state.explorerActiveModule || !mods.includes(this.state.explorerActiveModule)) this.state.explorerActiveModule = mods[0];

    this.targets.explorerTabs.innerHTML = mods.map(m => `
      <button onclick="window.app.setExplorerModule('${m}')" class="px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${this.state.explorerActiveModule === m ? 'bg-indigo-600 text-white' : 'bg-white/5 text-neutral-500'}">
        ${m}
      </button>
    `).join('');

    const rows = [];
    Object.values(this.state.dataStore[this.state.explorerActiveModule]).forEach(cust => {
       cust.records.forEach(rec => rows.push({ client: cust.customerName, ...rec }));
    });
    const keys = ['client', ...Object.keys(rows[0] || {}).filter(k => !['client', 'line_items'].includes(k))].slice(0, 10);
    let html = `<table class="w-full text-left text-[9px]"><thead class="border-b border-white/10"><tr>${keys.map(k => `<th class="p-2 uppercase opacity-50 font-black">${k}</th>`).join('')}</tr></thead><tbody>`;
    rows.forEach(r => html += `<tr class="border-b border-white/5">${keys.map(k => `<td class="p-2">${r[k] || '---'}</td>`).join('')}</tr>`);
    this.targets.explorerArea.innerHTML = html + `</tbody></table>`;
  }

  setExplorerModule(m) { this.state.explorerActiveModule = m; this.renderExplorer(); }

  renderStatementUI() {
    if (this.state.statementData.length === 0) {
      this.targets.emptyState.classList.remove('view-hidden');
      this.targets.renderArea.innerHTML = '';
      this.btns.download.disabled = true; return;
    }
    this.targets.emptyState.classList.add('view-hidden');
    this.btns.download.disabled = false;

    const org = this.state.currentOrgDetails || {};
    let html = `<div class="statement-view font-inter" id="pdf-content">
      <div class="flex justify-between items-start mb-12">
        <div>
          <h1 class="text-2xl font-black uppercase tracking-tighter leading-none">${org.name || 'Organization'}</h1>
          <p class="text-[9px] text-neutral-500 font-bold uppercase mt-2">Outstanding Ledger Analysis</p>
        </div>
        <div class="text-right">
          <h2 class="text-3xl font-black theme-accent-text tracking-tighter leading-none">STATEMENT</h2>
          <p class="mt-4 text-[8px] font-black uppercase tracking-widest text-neutral-400">Date: ${new Date().toLocaleDateString()}</p>
        </div>
      </div>
      <table class="w-full text-left border-collapse table-fixed">
        <thead><tr class="theme-accent-bg text-[8px] font-black uppercase tracking-widest"><th class="py-2 px-3 w-[30px]">#</th><th class="py-2 px-3 w-[160px]">Service Item</th><th class="py-2 px-3 w-[45px] text-center">Qty</th><th class="py-2 px-3 w-[95px] text-right">Amount</th><th class="py-2 px-3 w-[80px] text-center">Reference</th><th class="py-2 px-3 w-[95px] text-right">Balance</th></tr></thead>
        <tbody class="text-[9px]">`;

    let globalCounter = 1;
    this.state.statementData.forEach(cust => {
      const clientTotal = cust.invoices.reduce((s, i) => s + i.balance, 0);
      html += `<tr class="theme-row-bg border-b-2 theme-border-color">
        <td colspan="4" class="py-3 px-3 font-black text-[11px] uppercase tracking-tighter">Client: ${cust.customerName}</td>
        <td colspan="2" class="py-3 px-3 text-right font-black text-[11px] uppercase tracking-tighter">TOTAL DUE: ${clientTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>`;
      
      cust.invoices.forEach(inv => {
        let runBal = 0;
        html += `<tr class="bg-neutral-50/50"><td colspan="6" class="py-2 px-3 font-bold text-neutral-400 uppercase italic">Invoice: ${inv.invoiceNo} (${inv.date})</td></tr>`;
        inv.items.forEach(item => {
          runBal += item.subTotal;
          html += `<tr class="border-b border-neutral-100">
            <td class="py-2 px-3 text-[8px] opacity-25 font-mono">${globalCounter++}</td>
            <td class="py-2 px-3 font-bold truncate" contenteditable="true">${item.itemName}</td>
            <td class="py-2 px-3 text-center" contenteditable="true">${item.qty}</td>
            <td class="py-2 px-3 text-right font-semibold" contenteditable="true">${item.subTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td class="py-2 px-3 text-center text-[8px] font-mono opacity-50">${inv.invoiceNo}</td>
            <td class="py-2 px-3 text-right font-black text-neutral-800">${runBal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          </tr>`;
        });
        html += `<tr class="border-t border-neutral-300"><td colspan="5" class="py-2 px-3 text-right font-bold text-neutral-500 uppercase text-[8px]">Inv Outstanding:</td><td class="py-2 px-3 text-right font-black text-indigo-600">${inv.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr><tr class="h-3"></tr>`; 
      });
    });
    this.targets.renderArea.innerHTML = html + `</tbody></table></div>`;
  }

  showLoading(prog, txt) {
    this.views.loadingBar.classList.remove('view-hidden');
    this.views.loadingOverlay.classList.remove('view-hidden');
    this.views.loadingProgress.style.width = `${prog}%`;
    this.views.loadingText.innerText = txt.toUpperCase();
  }

  hideLoading() {
    this.views.loadingProgress.style.width = '100%';
    setTimeout(() => {
      this.views.loadingBar.classList.add('view-hidden');
      this.views.loadingOverlay.classList.add('view-hidden');
      this.views.loadingProgress.style.width = '0%';
    }, 800);
  }

  filterCustomers(term) {
    this.views.customerList.querySelectorAll('div').forEach(item => {
      const name = item.innerText.toLowerCase();
      item.style.display = name.includes(term.toLowerCase()) ? 'flex' : 'none';
    });
  }

  downloadPDF() {
    const el = document.getElementById('pdf-content');
    if (!el) return;
    this.showLoading(85, "GENERATING FILE...");
    html2pdf().set({
      margin: 0, filename: `Ledger_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: { scale: 3.5, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save().then(() => this.hideLoading());
  }

  log(m) { this.targets.log.innerText = `SYS: ${m.toUpperCase()}`; }
  
  showLandingError(m) { 
    if (this.views.landingError) {
      this.views.landingError.classList.remove('view-hidden');
      this.targets.landingErrorText.innerText = m;
    }
    this.hideLoading();
  }

  logout(reload = true) { 
    localStorage.removeItem('zoho_access_token');
    this.state.accessToken = null;
    if (reload) {
      window.location.hash = '';
      window.location.reload(); 
    }
  }
}

// Global initialization
window.app = new ZohoLedgerApp();
