
/**
 * BIZSENSE STATEMENT PRO - ENTERPRISE CORE
 * Advanced Multi-Account Sync & Data Exploration Engine
 */

class ZohoLedgerApp {
  constructor() {
    this.proxyPrefix = "https://corsproxy.io/?";
    this.initStorage();
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
      customLogo: localStorage.getItem('biz_logo') || null,
      zoom: 1.0,
      activeView: 'ledger', // 'ledger' or 'explorer'
      explorerModule: 'invoices'
    };

    this.handleOAuthCallback();
    this.init();
  }

  initStorage() {
    const savedConfig = localStorage.getItem('zoho_config');
    this.config = savedConfig ? JSON.parse(savedConfig) : { clientId: '', region: 'com' };
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.cacheDOM();
      this.bindEvents();
      this.updateConfigStatus();
      this.checkSession();
      window.addEventListener('resize', () => this.autoFitZoom());
    });
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
      statementContainer: document.getElementById('statement-render-target'),
      ledgerView: document.getElementById('view-ledger-container'),
      explorerView: document.getElementById('view-explorer-container')
    };
    
    this.inputs = {
      orgSelect: document.getElementById('select-organization'),
      search: document.getElementById('customer-search'),
      clientId: document.getElementById('cfg-client-id'),
      region: document.getElementById('cfg-region'),
      displayRedirect: document.getElementById('display-redirect-uri'),
      moduleCheckboxes: document.querySelectorAll('#module-selector input'),
      logoUpload: document.getElementById('logo-upload')
    };

    this.btns = {
      connect: document.getElementById('btn-connect'),
      saveConfig: document.getElementById('btn-save-config'),
      resetConfig: document.getElementById('btn-reset-config'),
      downloadPdf: document.getElementById('btn-download-pdf'),
      downloadExcel: document.getElementById('btn-download-excel'),
      logout: document.getElementById('btn-logout'),
      switchId: document.getElementById('btn-switch-identity'),
      selectAll: document.getElementById('btn-select-all'),
      clearAll: document.getElementById('btn-clear-all'),
      openConfig: document.getElementById('btn-open-config-landing'),
      closeConfig: document.getElementById('btn-close-config'),
      openSettings: document.getElementById('btn-project-settings'),
      closeSettings: document.getElementById('btn-close-settings'),
      applySettings: document.getElementById('btn-apply-settings'),
      zoomIn: document.getElementById('btn-zoom-in'),
      zoomOut: document.getElementById('btn-zoom-out'),
      zoomFit: document.getElementById('btn-zoom-fit'),
      toggleLedger: document.getElementById('btn-view-ledger'),
      toggleExplorer: document.getElementById('btn-view-explorer')
    };

    this.targets = {
      renderArea: document.getElementById('statement-render-target'),
      emptyState: document.getElementById('empty-state'),
      log: document.getElementById('log-message'),
      stats: document.getElementById('data-stats'),
      errorText: document.getElementById('landing-error-text'),
      explorerTabs: document.getElementById('explorer-tabs'),
      explorerThead: document.getElementById('explorer-thead'),
      explorerTbody: document.getElementById('explorer-tbody')
    };

    const redirectUri = window.location.origin + window.location.pathname;
    if (this.inputs.displayRedirect) this.inputs.displayRedirect.innerText = redirectUri;
    this.inputs.moduleCheckboxes.forEach(cb => cb.checked = this.state.activeModules.has(cb.value));
  }

  bindEvents() {
    this.btns.connect.onclick = () => this.startAuth();
    this.btns.saveConfig.onclick = () => this.saveConfig();
    this.btns.resetConfig.onclick = () => this.wipeConfiguration();
    this.btns.openConfig.onclick = () => this.toggleConfig(true);
    this.btns.closeConfig.onclick = () => this.toggleConfig(false);
    this.btns.logout.onclick = () => this.logout();
    this.btns.switchId.onclick = () => this.startAuth(true); 
    this.btns.downloadPdf.onclick = () => this.downloadPDF();
    this.btns.downloadExcel.onclick = () => this.downloadExcel();
    this.btns.selectAll.onclick = () => this.toggleAllCustomers(true);
    this.btns.clearAll.onclick = () => this.toggleAllCustomers(false);
    this.btns.openSettings.onclick = () => this.views.settingsModal.classList.remove('view-hidden');
    this.btns.closeSettings.onclick = () => this.views.settingsModal.classList.add('view-hidden');
    
    this.btns.toggleLedger.onclick = () => this.switchView('ledger');
    this.btns.toggleExplorer.onclick = () => this.switchView('explorer');

    this.btns.applySettings.onclick = () => {
      this.state.activeModules.clear();
      this.inputs.moduleCheckboxes.forEach(cb => { if(cb.checked) this.state.activeModules.add(cb.value); });
      localStorage.setItem('active_modules', JSON.stringify(Array.from(this.state.activeModules)));
      this.views.settingsModal.classList.add('view-hidden');
      this.syncAllActiveCustomers();
    };

    this.btns.zoomIn.onclick = () => this.setZoom(this.state.zoom + 0.1);
    this.btns.zoomOut.onclick = () => this.setZoom(this.state.zoom - 0.1);
    this.btns.zoomFit.onclick = () => this.autoFitZoom();
    this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
    this.inputs.logoUpload.onchange = (e) => this.handleLogoUpload(e);
    
    this.inputs.orgSelect.onchange = (e) => this.handleOrgSwitch(e.target.value);
  }

  async handleOrgSwitch(orgId) {
    this.showLoading(20, "Switching Project Context...");
    this.state.selectedOrgId = orgId;
    localStorage.setItem('zoho_selected_org_id', orgId);
    
    // Total reset of data state for security and consistency
    this.state.dataStore = { invoices: {}, estimates: {}, salesorders: {}, creditnotes: {} };
    this.state.invoiceDetailsCache = {};
    
    // Refetch the relevant data for the new org
    await this.fetchOrganizationDetails();
    await this.fetchCustomers();
    await this.syncAllActiveCustomers();
    
    this.hideLoading();
    this.log(`Project Switched: ${this.state.currentOrgDetails?.name}`);
  }

  switchView(view) {
    this.state.activeView = view;
    this.views.ledgerView.classList.toggle('view-hidden', view !== 'ledger');
    this.views.explorerView.classList.toggle('view-hidden', view !== 'explorer');
    
    this.btns.toggleLedger.classList.toggle('bg-indigo-600', view === 'ledger');
    this.btns.toggleLedger.classList.toggle('text-white', view === 'ledger');
    this.btns.toggleLedger.classList.toggle('text-neutral-500', view !== 'ledger');
    
    this.btns.toggleExplorer.classList.toggle('bg-indigo-600', view === 'explorer');
    this.btns.toggleExplorer.classList.toggle('text-white', view === 'explorer');
    this.btns.toggleExplorer.classList.toggle('text-neutral-500', view !== 'explorer');

    if (view === 'explorer') this.renderExplorer();
    else this.autoFitZoom();
  }

  handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      this.state.customLogo = event.target.result;
      localStorage.setItem('biz_logo', this.state.customLogo);
      this.renderStatementUI();
    };
    reader.readAsDataURL(file);
  }

  handleOAuthCallback() {
    const hash = window.location.hash;
    const search = window.location.search;
    
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      this.state.accessToken = params.get('access_token');
      localStorage.setItem('zoho_access_token', this.state.accessToken);
      window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
    } else if (search && search.includes('error')) {
      const params = new URLSearchParams(search);
      this.showLandingError(`OAuth Failure: ${params.get('error')}`);
      window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
    }
  }

  async checkSession() {
    if (this.state.accessToken) {
      this.showLoading(20, "Securing API Pipeline...");
      try {
        const success = await this.discoverOrganizations();
        if (success) {
          this.views.landing.classList.add('view-hidden');
          this.views.dashboard.classList.remove('view-hidden');
          await this.fetchOrganizationDetails();
          await this.fetchCustomers();
          this.autoFitZoom();
        }
      } catch (err) {
        this.showLandingError(err.message);
        this.logout(false);
      }
      this.hideLoading();
    }
  }

  async discoverOrganizations() {
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/organizations`;
      const res = await this.rawRequest(url);
      if (res && res.organizations) {
        this.state.organizations = res.organizations;
        this.inputs.orgSelect.innerHTML = '';
        res.organizations.forEach(org => {
          const opt = document.createElement('option');
          opt.value = org.organization_id; opt.innerText = org.name;
          this.inputs.orgSelect.appendChild(opt);
        });
        if (!this.state.selectedOrgId) this.state.selectedOrgId = res.organizations[0].organization_id;
        this.inputs.orgSelect.value = this.state.selectedOrgId;
        return true;
      }
      return false;
    } catch (e) { throw new Error(`Connectivity: ${e.message}`); }
  }

  async fetchOrganizationDetails() {
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/settings/organization?organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.organization) this.state.currentOrgDetails = res.organization;
    } catch (e) { console.warn("Detail fetch failed", e); }
  }

  async rawRequest(url) {
    const res = await fetch(this.proxyPrefix + encodeURIComponent(url), {
      headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`, 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (res.status === 401) throw new Error("Session Expired");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "API Rejected Request");
    }
    return res.json();
  }

  startAuth(force = false) {
    if (!this.config.clientId) return this.toggleConfig(true);
    this.showLoading(15, "Initializing Handshake...");
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.estimates.READ,ZohoBooks.salesorders.READ,ZohoBooks.creditnotes.READ,ZohoBooks.settings.READ";
    const prompt = force ? '&prompt=select_account' : '&prompt=consent';
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}${prompt}`;
    window.location.href = authUrl;
  }

  async fetchCustomers() {
    this.showLoading(40, "Indexing Customer Registry...");
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/contacts?contact_type=customer&status=active&organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.contacts) {
        this.state.customers = res.contacts;
        this.renderCustomerList();
      }
    } catch (e) { this.log(`Error: ${e.message}`); }
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
        <span class="truncate font-black uppercase text-[9px] text-neutral-400 group-hover:text-white tracking-widest">${c.contact_name}</span>
      `;
      div.onclick = () => this.handleCustomerClick(c.contact_id);
      this.views.customerList.appendChild(div);
    });
  }

  async handleCustomerClick(id) {
    if (this.state.selectedCustomerIds.has(id)) {
      this.state.selectedCustomerIds.delete(id);
      Object.keys(this.state.dataStore).forEach(mod => {
        if (this.state.dataStore[mod][id]) delete this.state.dataStore[mod][id];
      });
    } else {
      this.state.selectedCustomerIds.add(id);
      await this.syncCustomerData(id);
    }
    this.renderCustomerList();
    this.updateUIVisuals();
  }

  updateUIVisuals() {
    if (this.state.activeView === 'ledger') this.renderStatementUI();
    else this.renderExplorer();
    this.updateStats();
    this.autoFitZoom();
  }

  updateStats() {
    let totalRecords = 0;
    Object.values(this.state.dataStore).forEach(moduleData => {
      Object.values(moduleData).forEach(customerData => {
        totalRecords += (customerData.records || []).length;
      });
    });
    this.targets.stats.innerText = `${totalRecords} RECORDS MAPPED`;
  }

  async syncCustomerData(id) {
    const customer = this.state.customers.find(c => c.contact_id === id);
    if (!customer) return;
    this.showLoading(50, `Pulling: ${customer.contact_name}`);
    for (const module of this.state.activeModules) {
      try {
        const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?customer_id=${id}&organization_id=${this.state.selectedOrgId}`;
        const res = await this.rawRequest(url);
        this.state.dataStore[module][id] = { customerName: customer.contact_name, records: res[module] || [] };
        
        if (module === 'invoices') {
          for (const inv of this.state.dataStore[module][id].records) {
            if (!this.state.invoiceDetailsCache[inv.invoice_id]) {
              const dRes = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/invoices/${inv.invoice_id}?organization_id=${this.state.selectedOrgId}`);
              this.state.invoiceDetailsCache[inv.invoice_id] = dRes.invoice;
            }
          }
        }
      } catch (e) { 
        console.warn(`Module ${module} might be disabled or missing for this account.`);
        this.state.dataStore[module][id] = { customerName: customer.contact_name, records: [] };
      }
    }
    this.hideLoading();
  }

  async syncAllActiveCustomers() {
    this.state.dataStore = { invoices: {}, estimates: {}, salesorders: {}, creditnotes: {} };
    for (const id of Array.from(this.state.selectedCustomerIds)) {
      await this.syncCustomerData(id);
    }
    this.updateUIVisuals();
  }

  renderExplorer() {
    this.targets.explorerTabs.innerHTML = '';
    this.state.activeModules.forEach(mod => {
      const btn = document.createElement('button');
      btn.className = `px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${this.state.explorerModule === mod ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/5 text-neutral-500'}`;
      btn.innerText = mod;
      btn.onclick = () => {
        this.state.explorerModule = mod;
        this.renderExplorer();
      };
      this.targets.explorerTabs.appendChild(btn);
    });

    const moduleData = this.state.dataStore[this.state.explorerModule];
    const allRecords = [];
    Object.entries(moduleData || {}).forEach(([cid, data]) => {
      data.records.forEach(r => allRecords.push({ ...r, _customer: data.customerName }));
    });

    if (allRecords.length === 0) {
      this.targets.explorerThead.innerHTML = '';
      this.targets.explorerTbody.innerHTML = '<tr><td colspan="100" class="py-20 text-center text-neutral-600 font-black uppercase text-[10px] tracking-widest">No data mapped for this module</td></tr>';
      return;
    }

    // Determine Headers from first record (flattening objects)
    const headers = ['_customer', ...Object.keys(allRecords[0]).filter(k => k !== '_customer' && typeof allRecords[0][k] !== 'object')];
    this.targets.explorerThead.innerHTML = `<tr>${headers.map(h => `<th>${h.replace('_', '')}</th>`).join('')}</tr>`;
    
    this.targets.explorerTbody.innerHTML = allRecords.map(row => `
      <tr>${headers.map(h => `<td>${row[h] || '---'}</td>`).join('')}</tr>
    `).join('');
  }

  renderStatementUI() {
    if (this.state.selectedCustomerIds.size === 0) {
      this.targets.emptyState.classList.remove('view-hidden');
      this.targets.renderArea.innerHTML = '';
      this.btns.downloadPdf.disabled = this.btns.downloadExcel.disabled = true;
      return;
    }
    this.targets.emptyState.classList.add('view-hidden');
    this.btns.downloadPdf.disabled = this.btns.downloadExcel.disabled = false;

    const org = this.state.currentOrgDetails || {};
    let html = `<div class="statement-view font-inter" id="pdf-content">
      <div class="flex justify-between items-start mb-10">
        <div>
          ${this.state.customLogo ? `<img src="${this.state.customLogo}" class="h-12 mb-4 object-contain">` : '<div class="h-12 w-32 bg-neutral-100 rounded mb-4 flex items-center justify-center text-[8px] text-neutral-400 border border-dashed border-neutral-300">BUSINESS LOGO</div>'}
          <h1 class="text-xl font-black uppercase tracking-tighter" contenteditable="true">${org.name || 'Organization Name'}</h1>
          <p class="text-[9px] text-neutral-500 font-bold uppercase mt-1" contenteditable="true">Confidential Itemized Ledger</p>
        </div>
        <div class="text-right">
          <h2 class="text-3xl font-black tracking-tighter leading-none" style="color:var(--theme-primary)" contenteditable="true">STATEMENT</h2>
          <p class="mt-2 text-[8px] font-black uppercase tracking-widest text-neutral-400">Date: ${new Date().toLocaleDateString()}</p>
        </div>
      </div>
      <table class="w-full text-left border-collapse table-fixed">
        <thead><tr class="bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest"><th class="py-2 px-3 w-[160px]">Description</th><th class="py-2 px-3 w-[45px] text-center">Qty</th><th class="py-2 px-3 w-[95px] text-right">Amount</th><th class="py-2 px-3 w-[80px] text-center">Reference</th><th class="py-2 px-3 w-[95px] text-right">Balance</th></tr></thead>
        <tbody class="text-[9px]">`;

    this.state.selectedCustomerIds.forEach(id => {
      const custData = this.state.dataStore.invoices[id];
      if (!custData) return;
      const total = custData.records.reduce((s, i) => s + i.balance, 0);
      html += `<tr class="bg-indigo-50 border-b-2 border-indigo-200">
        <td colspan="3" class="py-3 px-3 font-black text-[11px] uppercase tracking-tighter">Client: ${custData.customerName}</td>
        <td colspan="2" class="py-3 px-3 text-right font-black text-[11px] uppercase tracking-tighter">Due: ${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>`;
      
      custData.records.forEach(inv => {
        const details = this.state.invoiceDetailsCache[inv.invoice_id];
        let runBal = 0;
        html += `<tr class="bg-neutral-50"><td colspan="5" class="py-2 px-3 font-bold text-neutral-400 uppercase italic">Ref: ${inv.invoice_number} (${inv.date})</td></tr>`;
        details?.line_items?.forEach(li => {
          runBal += li.item_total;
          html += `<tr class="border-b border-neutral-100">
            <td class="py-2 px-3 font-bold truncate" contenteditable="true">${li.name || li.description}</td>
            <td class="py-2 px-3 text-center" contenteditable="true">${li.quantity}</td>
            <td class="py-2 px-3 text-right" contenteditable="true">${li.item_total.toLocaleString()}</td>
            <td class="py-2 px-3 text-center opacity-50 font-mono text-[8px]">${inv.invoice_number}</td>
            <td class="py-2 px-3 text-right font-black text-neutral-800">${runBal.toLocaleString()}</td>
          </tr>`;
        });
      });
    });
    this.targets.renderArea.innerHTML = html + `</tbody></table></div>`;
  }

  downloadExcel() {
    this.showLoading(80, "Constructing Workbook...");
    const data = [];
    this.state.selectedCustomerIds.forEach(id => {
      const cust = this.state.dataStore.invoices[id];
      if (!cust) return;
      cust.records.forEach(inv => {
        const details = this.state.invoiceDetailsCache[inv.invoice_id];
        details?.line_items?.forEach(li => {
          data.push({ 
            Client: cust.customerName, 
            Date: inv.date, 
            Reference: inv.invoice_number, 
            Item: li.name || li.description, 
            Qty: li.quantity, 
            Total: li.item_total 
          });
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `BizSense_Export_${Date.now()}.xlsx`);
    this.hideLoading();
  }

  downloadPDF() {
    const el = document.getElementById('pdf-content');
    this.showLoading(85, "Optimizing Render...");
    html2pdf().set({
      margin: 0, filename: `Statement_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: { scale: 3.5, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save().then(() => this.hideLoading());
  }

  setZoom(val) {
    this.state.zoom = Math.max(0.1, Math.min(3.0, val));
    if(this.views.statementContainer) this.views.statementContainer.style.transform = `scale(${this.state.zoom})`;
  }

  autoFitZoom() {
    if(!this.views.areaLedger) return;
    const w = this.views.areaLedger.clientWidth - 80;
    this.setZoom(w / (21 * 37.8));
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
    }, 800);
  }

  filterCustomers(term) {
    this.views.customerList.querySelectorAll('div').forEach(item => {
      const name = item.innerText.toLowerCase();
      item.style.display = name.includes(term.toLowerCase()) ? 'flex' : 'none';
    });
  }

  toggleConfig(show) { this.views.configModal.classList.toggle('view-hidden', !show); }
  saveConfig() {
    this.config = { clientId: document.getElementById('cfg-client-id').value.trim(), region: document.getElementById('cfg-region').value };
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.toggleConfig(false); this.updateConfigStatus();
  }
  updateConfigStatus() {
    this.btns.connect.disabled = !this.config.clientId;
    this.btns.connect.classList.toggle('opacity-50', !this.config.clientId);
  }
  logout(reload = true) {
    localStorage.clear();
    if(reload) window.location.reload();
  }
  log(m) { this.targets.log.innerText = `SYS: ${m.toUpperCase()}`; }
  showLandingError(m) { this.views.landingError.classList.remove('view-hidden'); this.targets.errorText.innerText = m; }

  toggleAllCustomers(selected) {
    if (selected) {
      this.state.customers.forEach(c => this.state.selectedCustomerIds.add(c.contact_id));
      this.syncAllActiveCustomers();
    } else {
      this.state.selectedCustomerIds.clear();
      this.state.dataStore = { invoices: {}, estimates: {}, salesorders: {}, creditnotes: {} };
      this.updateUIVisuals();
    }
    this.renderCustomerList();
  }
}

window.app = new ZohoLedgerApp();
