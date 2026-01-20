/**
 * BIZSENSE STATEMENT PRO - ENTERPRISE CORE
 * Advanced Item-Level Ledger & Ultra-Detailed Analytics Engine
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
      activeModules: new Set(JSON.parse(localStorage.getItem('active_modules')) || ['invoices', 'creditnotes', 'estimates', 'salesorders']), 
      dataStore: { invoices: {}, estimates: {}, salesorders: {}, creditnotes: {} },
      invoiceDetailsCache: {},
      customLogo: localStorage.getItem('biz_logo') || null,
      zoom: 0.75,
      activeView: 'ledger',
      explorerModule: 'invoices',
      currency: 'LKR'
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
      setTimeout(() => this.autoFitZoom(), 1000);
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
      explorerView: document.getElementById('view-explorer-container'),
      pdfTemp: document.getElementById('pdf-export-temp')
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
    
    // Total reset for clean project switch
    this.state.dataStore = { invoices: {}, estimates: {}, salesorders: {}, creditnotes: {} };
    this.state.invoiceDetailsCache = {};
    this.state.selectedCustomerIds = new Set();
    this.state.customLogo = localStorage.getItem('biz_logo') || null;

    try {
      await this.fetchOrganizationDetails();
      await this.fetchCustomers();
      this.renderCustomerList();
      this.updateUIVisuals();
      this.log(`Project Loaded: ${this.state.currentOrgDetails?.name}`);
    } catch (err) {
      this.log(`Load Error: ${err.message}`);
    } finally {
      this.hideLoading();
    }
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
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      this.state.accessToken = params.get('access_token');
      localStorage.setItem('zoho_access_token', this.state.accessToken);
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
    this.showLoading(50, `Updating Ledger: ${customer.contact_name}`);
    
    for (const module of this.state.activeModules) {
      try {
        const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?customer_id=${id}&organization_id=${this.state.selectedOrgId}`;
        const res = await this.rawRequest(url);
        this.state.dataStore[module][id] = { customerName: customer.contact_name, records: res[module] || [] };
        
        if (module === 'invoices' || module === 'creditnotes') {
          const key = module === 'invoices' ? 'invoice_id' : 'creditnote_id';
          for (const rec of this.state.dataStore[module][id].records) {
            const rid = rec[key];
            if (!this.state.invoiceDetailsCache[rid]) {
              const dRes = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/${module}/${rid}?organization_id=${this.state.selectedOrgId}`);
              this.state.invoiceDetailsCache[rid] = dRes[module.slice(0, -1)];
            }
          }
        }
      } catch (e) { 
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
      this.targets.explorerTbody.innerHTML = '<tr><td colspan="100" class="py-20 text-center text-neutral-600 font-black uppercase text-[10px] tracking-widest">No mapping found</td></tr>';
      return;
    }

    const headers = ['_customer', ...Object.keys(allRecords[0]).filter(k => k !== '_customer' && typeof allRecords[0][k] !== 'object')];
    this.targets.explorerThead.innerHTML = `<tr>${headers.map(h => `<th>${h.replace('_', '')}</th>`).join('')}</tr>`;
    this.targets.explorerTbody.innerHTML = allRecords.map(row => `<tr>${headers.map(h => `<td>${row[h] || '---'}</td>`).join('')}</tr>`).join('');
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

    // Fixed: Dynamically grab the active project name from the dropdown
    const projectName = this.inputs.orgSelect.options[this.inputs.orgSelect.selectedIndex]?.text || 'Project Context N/A';
    
    // Page Builder Structure
    let html = '';
    let rowsHtml = '';
    let globalRunningTotal = 0;

    // Build Rows first to determine pagination needs
    this.state.selectedCustomerIds.forEach(id => {
      let clientRunTotal = 0;
      const clientName = this.state.customers.find(c => c.contact_id === id)?.contact_name || 'Anonymous Client';
      
      rowsHtml += `<tr class="bg-indigo-900 text-white"><td colspan="5" class="py-4 px-5 font-black text-[14px] uppercase tracking-tighter">Client Partition: ${clientName}</td></tr>`;
      
      const ledgerItems = [];
      this.state.activeModules.forEach(mod => {
        const modData = this.state.dataStore[mod][id];
        if (modData && modData.records) {
          modData.records.forEach(r => ledgerItems.push({ ...r, _type: mod }));
        }
      });

      ledgerItems.sort((a,b) => new Date(a.date) - new Date(b.date));

      const groupedByRef = {};
      const sortedRefs = [];
      ledgerItems.forEach(item => {
        const ref = item.invoice_number || item.creditnote_number || item.estimate_number || item.salesorder_number || 'TRX-N/A';
        if (!groupedByRef[ref]) {
          groupedByRef[ref] = { info: item, lines: [] };
          sortedRefs.push(ref);
        }
        const details = this.state.invoiceDetailsCache[item.invoice_id || item.creditnote_id];
        if (details && details.line_items) groupedByRef[ref].lines.push(...details.line_items);
        else groupedByRef[ref].lines.push({ name: `Aggregated ${item._type.toUpperCase()}`, quantity: 1, item_total: item.total || item.balance || 0 });
      });

      sortedRefs.forEach(ref => {
        const group = groupedByRef[ref];
        const isCredit = group.info._type === 'creditnotes';
        rowsHtml += `<tr class="invoice-group-header">
          <td colspan="5" class="py-2 px-5 font-bold text-indigo-700 uppercase italic text-[9px] border-b border-indigo-100">
            ${group.info._type.toUpperCase()} DOCUMENT - ${ref} (${group.info.date})
          </td>
        </tr>`;

        group.lines.forEach(li => {
          const amt = isCredit ? -li.item_total : li.item_total;
          clientRunTotal += amt;
          rowsHtml += this.createRowMarkup(li.name || li.description, li.quantity || 1, amt, ref, clientRunTotal, isCredit, group.info._type);
        });
      });

      rowsHtml += `<tr class="bg-indigo-50 border-t-4 border-indigo-600 client-footer" data-client="${id}">
        <td colspan="3" class="py-5 px-5 text-right font-black uppercase text-[10px] text-neutral-500">Statement Outstanding [${this.state.currency}]:</td>
        <td colspan="2" class="py-5 px-5 text-right font-black text-[18px] uppercase tracking-tighter text-indigo-700 total-cell">${clientRunTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr><tr class="h-10"></tr>`;
    });

    // Create a multi-page A4 structure
    // We wrap everything in A4 pages. Since standard browser paging is hard, 
    // we use a single long A4 div for the preview, but ensure backgrounds stack.
    html = `
      <div class="a4-page" id="pdf-content">
        <div class="flex justify-between items-start mb-12">
          <div class="flex-grow">
            ${this.state.customLogo ? `<img src="${this.state.customLogo}" class="h-16 mb-6 object-contain">` : '<div class="h-16 w-48 bg-neutral-100 rounded mb-6 flex items-center justify-center text-[9px] text-neutral-400 border border-dashed border-neutral-300 uppercase font-black">Company Identity Logo</div>'}
            <h1 class="text-3xl font-black uppercase tracking-tighter text-indigo-900" contenteditable="true">Project: ${projectName}</h1>
            <p class="text-[11px] text-indigo-500 font-black uppercase tracking-widest mt-1">Generated by BizSense InsightPRO Statement Generator</p>
          </div>
          <div class="text-right flex-shrink-0">
            <h2 class="text-5xl font-black tracking-tighter leading-none text-indigo-600" contenteditable="true">LEDGER</h2>
            <p class="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400">Ref: ${new Date().toISOString().slice(0,10).replace(/-/g,'')}</p>
            <p class="mt-1 text-[10px] font-black uppercase text-neutral-400">Date: ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
        
        <table class="w-full text-left border-collapse table-fixed master-ledger-table">
          <thead>
            <tr class="bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.2em]">
              <th class="py-3 px-5 w-[160px]">Service Item Description</th>
              <th class="py-3 px-3 w-[45px] text-center">Qty</th>
              <th class="py-3 px-3 w-[100px] text-right">Debit / Credit</th>
              <th class="py-3 px-3 w-[85px] text-center">Reference</th>
              <th class="py-3 px-5 w-[110px] text-right">Running Total</th>
            </tr>
          </thead>
          <tbody class="text-[10px] ledger-rows">
            ${rowsHtml}
          </tbody>
        </table>
      </div>`;

    this.targets.renderArea.innerHTML = html;
    this.attachLedgerListeners();
    this.autoFitZoom();
  }

  createRowMarkup(desc, qty, amt, ref, runTotal, isCredit, type) {
    return `<tr class="border-b border-neutral-100 hover:bg-neutral-50 transition-colors group ledger-item-row" data-type="${type}">
      <td class="py-3 px-5 font-bold truncate flex items-center gap-2">
        <button class="no-print row-del-btn opacity-0 group-hover:opacity-100 text-red-500 font-black hover:scale-125 transition-all">✕</button>
        <span contenteditable="true" class="desc-cell">${desc}</span>
      </td>
      <td class="py-3 px-3 text-center" contenteditable="true" class="qty-cell">${qty}</td>
      <td class="py-3 px-3 text-right font-bold ${isCredit ? 'text-red-500' : 'text-neutral-800'}" contenteditable="true" class="amt-cell">${amt.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      <td class="py-3 px-3 text-center opacity-40 font-mono text-[9px]">${ref}</td>
      <td class="py-3 px-5 text-right font-black text-indigo-900 run-total-cell">${runTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
    </tr>`;
  }

  attachLedgerListeners() {
    this.targets.renderArea.querySelectorAll('.row-del-btn').forEach(btn => {
      btn.onclick = (e) => {
        const row = e.target.closest('tr');
        row.remove();
        this.recalculateAllLedgers();
      };
    });
    this.targets.renderArea.querySelectorAll('[contenteditable="true"]').forEach(cell => {
      cell.oninput = () => this.recalculateAllLedgers();
    });
  }

  recalculateAllLedgers() {
    const rows = this.targets.renderArea.querySelectorAll('.master-ledger-table tbody tr');
    let runningTotal = 0;
    rows.forEach(row => {
      if (row.classList.contains('ledger-item-row')) {
        const amtCell = row.querySelector('.amt-cell') || row.children[2];
        const runTotalCell = row.querySelector('.run-total-cell') || row.children[4];
        const val = parseFloat(amtCell.innerText.replace(/,/g, '')) || 0;
        runningTotal += val;
        runTotalCell.innerText = runningTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
      } else if (row.classList.contains('client-footer')) {
        const totalCell = row.querySelector('.total-cell');
        totalCell.innerText = runningTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
      } else if (row.classList.contains('bg-indigo-900')) {
        runningTotal = 0;
      }
    });
  }

  downloadExcel() {
    this.showLoading(80, "Data Aggregation...");
    const data = [];
    const projectName = this.inputs.orgSelect.options[this.inputs.orgSelect.selectedIndex]?.text || 'Unknown Project';

    this.state.selectedCustomerIds.forEach(id => {
      const clientName = this.state.customers.find(c => c.contact_id === id)?.contact_name || 'Unknown';
      this.state.activeModules.forEach(mod => {
        const records = this.state.dataStore[mod][id]?.records || [];
        records.forEach(r => {
          const details = this.state.invoiceDetailsCache[r.invoice_id || r.creditnote_id];
          const docRef = r.invoice_number || r.creditnote_number || r.estimate_number || r.salesorder_number || 'N/A';
          const multiplier = mod === 'creditnotes' ? -1 : 1;
          if (details && details.line_items) {
            details.line_items.forEach(li => {
              data.push({
                'Project': projectName,
                'Customer': clientName,
                'Module': mod.toUpperCase(),
                'Date': r.date,
                'Reference': docRef,
                'Description': li.name || li.description || '',
                'Qty': li.quantity || 1,
                'Total (LKR)': multiplier * (li.item_total || 0),
                'Status': r.status || ''
              });
            });
          }
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement_Ledger");
    XLSX.writeFile(wb, `InsightPRO_Excel_${Date.now()}.xlsx`);
    this.hideLoading();
  }

  downloadPDF() {
    this.showLoading(85, "Rendering Multi-Page High-Res PDF...");
    
    // Fixed: Capture the correctly rendered preview
    const original = document.getElementById('pdf-content');
    if (!original) return;
    
    // Create a pristine temp container that isn't transformed or scaled
    const tempContainer = document.getElementById('pdf-export-temp');
    tempContainer.innerHTML = '';
    
    const clone = original.cloneNode(true);
    clone.style.transform = 'none';
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';
    clone.style.width = '210mm';
    // Ensure the table height doesn't break incorrectly
    clone.querySelectorAll('tr').forEach(tr => {
      tr.style.pageBreakInside = 'avoid';
      tr.style.breakInside = 'avoid-page';
    });
    
    tempContainer.appendChild(clone);
    tempContainer.classList.remove('view-hidden');
    tempContainer.style.display = 'block';

    const opt = {
      margin: [10, 0, 10, 0],
      filename: `BIZSENSE_STATEMENT_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(tempContainer).save().then(() => {
      tempContainer.classList.add('view-hidden');
      tempContainer.style.display = 'none';
      tempContainer.innerHTML = '';
      this.hideLoading();
    }).catch(err => {
      console.error("PDF Fail", err);
      this.hideLoading();
    });
  }

  setZoom(val) {
    this.state.zoom = Math.max(0.1, Math.min(3.0, val));
    const pages = this.targets.renderArea.querySelectorAll('.a4-page');
    pages.forEach(p => {
      p.style.transform = `scale(${this.state.zoom})`;
    });
    // Adjust visual height for scrolling scaled content
    const standardA4H_px = 29.7 * 37.8;
    const actualHeight = original => {
      if (!original) return standardA4H_px;
      return original.scrollHeight * this.state.zoom;
    };
    const mainPage = pages[0];
    this.targets.renderArea.style.height = `${actualHeight(mainPage) + 150}px`;
  }

  autoFitZoom() {
    if(!this.views.areaLedger) return;
    const wrapperW = this.views.areaLedger.clientWidth;
    const targetW = wrapperW * 0.85; // Fill 85% of width
    const standardA4W_px = 21 * 37.8;
    const calculatedZoom = targetW / standardA4W_px;
    this.setZoom(Math.max(0.3, calculatedZoom));
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
    this.toggleConfig(false); 
    this.updateConfigStatus();
  }
  updateConfigStatus() {
    const valid = this.config.clientId && this.config.clientId.length > 5;
    this.btns.connect.disabled = !valid;
  }
  logout(reload = true) {
    localStorage.removeItem('zoho_access_token');
    localStorage.removeItem('zoho_selected_org_id');
    if(reload) window.location.reload();
  }
  log(m) { this.targets.log.innerText = `SYS: ${m.toUpperCase()}`; }
  showLandingError(m) { 
    this.views.landingError.classList.remove('view-hidden'); 
    this.targets.errorText.innerText = m; 
  }

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
