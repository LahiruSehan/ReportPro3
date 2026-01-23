/**
 * BIZSENSE STATEMENT PRO - ENTERPRISE SOA ENGINE
 * Transaction-level Statement of Accounts with Nested Item Details
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
      customerFullDetails: {}, // Cache for opening balances and specific contact info
      selectedCustomerIds: new Set(),
      activeModules: new Set(JSON.parse(localStorage.getItem('active_modules')) || ['invoices', 'creditnotes', 'payments']), 
      dataStore: { invoices: {}, creditnotes: {}, payments: {} },
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
    this.inputs.moduleCheckboxes.forEach(cb => {
        if (this.state.activeModules.has(cb.value)) cb.checked = true;
    });
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
    this.showLoading(20, "Re-indexing Project Context...");
    this.state.selectedOrgId = orgId;
    localStorage.setItem('zoho_selected_org_id', orgId);
    
    this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {} };
    this.state.invoiceDetailsCache = {};
    this.state.selectedCustomerIds = new Set();
    this.state.customerFullDetails = {};
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
      this.showLoading(20, "Establishing Data Pipeline...");
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
    this.showLoading(15, "Authenticating Secure Tunnel...");
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.estimates.READ,ZohoBooks.salesorders.READ,ZohoBooks.creditnotes.READ,ZohoBooks.customerpayments.READ,ZohoBooks.settings.READ";
    const prompt = force ? '&prompt=select_account' : '&prompt=consent';
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}${prompt}`;
    window.location.href = authUrl;
  }

  async fetchCustomers() {
    this.showLoading(40, "Indexing Master Registry...");
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
    this.showLoading(50, `Mapping SOA Data: ${customer.contact_name}`);
    
    // Fetch Customer Full Details for Opening Balance
    try {
        const cRes = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/contacts/${id}?organization_id=${this.state.selectedOrgId}`);
        this.state.customerFullDetails[id] = cRes.contact;
    } catch(e) { console.warn("SOA Context fetch failed", e); }

    const modulesToSync = ['invoices', 'creditnotes', 'customerpayments']; 
    
    for (const module of modulesToSync) {
      try {
        const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?customer_id=${id}&organization_id=${this.state.selectedOrgId}`;
        const res = await this.rawRequest(url);
        const storageKey = module === 'customerpayments' ? 'payments' : module;
        this.state.dataStore[storageKey][id] = { customerName: customer.contact_name, records: res[module] || [] };
        
        // Deep cache item level details for SOA multi-line rendering
        if (module === 'invoices' || module === 'creditnotes') {
          const key = module === 'invoices' ? 'invoice_id' : 'creditnote_id';
          for (const rec of this.state.dataStore[storageKey][id].records) {
            const rid = rec[key];
            if (!this.state.invoiceDetailsCache[rid]) {
              const dRes = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/${module}/${rid}?organization_id=${this.state.selectedOrgId}`);
              this.state.invoiceDetailsCache[rid] = dRes[module.slice(0, -1)];
            }
          }
        }
      } catch (e) { 
        console.error(`Module ${module} sync fail`, e);
      }
    }
    this.hideLoading();
  }

  async syncAllActiveCustomers() {
    this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {} };
    for (const id of Array.from(this.state.selectedCustomerIds)) {
      await this.syncCustomerData(id);
    }
    this.updateUIVisuals();
  }

  renderExplorer() {
    this.targets.explorerTabs.innerHTML = '';
    const available = ['invoices', 'creditnotes', 'payments'];
    available.forEach(mod => {
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
      this.targets.explorerTbody.innerHTML = '<tr><td colspan="100" class="py-20 text-center text-neutral-600 font-black uppercase text-[10px] tracking-widest">No matching transactional data</td></tr>';
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

    const projectName = this.inputs.orgSelect.options[this.inputs.orgSelect.selectedIndex]?.text || 'Project Context N/A';
    
    let html = '';

    this.state.selectedCustomerIds.forEach(id => {
      const customer = this.state.customerFullDetails[id] || {};
      const clientName = customer.contact_name || 'Valued Client';
      const openingBalance = parseFloat(customer.opening_balance) || 0;
      let runningBalance = openingBalance;
      
      let totalInvoiced = 0;
      let totalReceived = 0;

      // Aggregating all transactions for the timeline
      let transactions = [];
      
      // 1. Invoices
      (this.state.dataStore.invoices[id]?.records || []).forEach(inv => {
        transactions.push({
          date: inv.date,
          type: 'Invoice',
          ref: inv.invoice_number,
          due_date: inv.due_date,
          amount: parseFloat(inv.total) || 0,
          payment: 0,
          raw: inv,
          sortDate: new Date(inv.date)
        });
      });

      // 2. Payments
      (this.state.dataStore.payments[id]?.records || []).forEach(pay => {
        transactions.push({
          date: pay.date,
          type: 'Payment Received',
          ref: pay.payment_number,
          amount: 0,
          payment: parseFloat(pay.amount) || 0,
          raw: pay,
          sortDate: new Date(pay.date)
        });
      });

      // 3. Credit Notes
      (this.state.dataStore.creditnotes[id]?.records || []).forEach(cn => {
        transactions.push({
          date: cn.date,
          type: 'Credit Note',
          ref: cn.creditnote_number,
          amount: 0, // Moved to payment column
          payment: parseFloat(cn.total) || 0, // Treated as payment
          raw: cn,
          sortDate: new Date(cn.date)
        });
      });

      // Sort chronological
      transactions.sort((a,b) => a.sortDate - b.sortDate);

      let rowsHtml = `
        <tr class="bg-indigo-50 font-black italic">
          <td class="py-2 px-3 border-b" colspan="2">OPENING BALANCE</td>
          <td class="py-2 px-3 border-b text-left italic opacity-60">Balance brought forward</td>
          <td class="py-2 px-3 border-b text-right" colspan="2">---</td>
          <td class="py-2 px-3 border-b text-right">${openingBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        </tr>
      `;

      transactions.forEach(tx => {
        runningBalance += tx.amount;
        runningBalance -= tx.payment;
        
        totalInvoiced += (tx.amount > 0 ? tx.amount : 0);
        totalReceived += tx.payment;

        let detailsHtml = '';
        if (tx.type === 'Invoice') {
          const det = this.state.invoiceDetailsCache[tx.raw.invoice_id];
          detailsHtml = `<div class="font-bold text-indigo-700">Invoice ${tx.ref} (Due: ${tx.due_date})</div>`;
          if (det && det.line_items) {
            det.line_items.forEach(li => {
              const rate = parseFloat(li.rate || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
              const total = parseFloat(li.item_total || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
              detailsHtml += `<div class="pl-2 opacity-80 text-[8px]">• ${li.name} <span class="font-mono text-[7px] opacity-75">(${li.quantity} × ${rate} = ${total})</span></div>`;
            });
          }
        } else if (tx.type === 'Payment Received') {
          detailsHtml = `<div class="font-bold text-emerald-700 uppercase">Payment Received</div>`;
          detailsHtml += `<div class="pl-2 opacity-80 text-[8px]">Ref: ${tx.ref}</div>`;
          if (tx.raw.invoices && tx.raw.invoices.length > 0) {
            detailsHtml += `<div class="pl-2 opacity-80 text-[8px]">Against ${tx.raw.invoices.map(i => i.invoice_number).join(', ')}</div>`;
          }
        } else if (tx.type === 'Credit Note') {
          const det = this.state.invoiceDetailsCache[tx.raw.creditnote_id];
          detailsHtml = `<div class="font-bold text-red-700">Credit Note ${tx.ref}</div>`;
          if (det && det.line_items) {
            det.line_items.forEach(li => {
              const rate = parseFloat(li.rate || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
              const total = parseFloat(li.item_total || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
              detailsHtml += `<div class="pl-2 opacity-80 text-[8px]">• ${li.name} <span class="font-mono text-[7px] opacity-75">(${li.quantity} × ${rate} = ${total})</span></div>`;
            });
          }
        }

        rowsHtml += `
          <tr class="border-b border-neutral-100 ledger-item-row group">
            <td class="py-1.5 px-3 align-top font-bold text-neutral-400">${tx.date}</td>
            <td class="py-1.5 px-3 align-top font-black text-indigo-900 uppercase">${tx.type}</td>
            <td class="py-1.5 px-3 align-top text-left text-[9px] leading-tight details-cell">${detailsHtml}</td>
            <td class="py-1.5 px-3 align-top text-right font-bold ${tx.amount < 0 ? 'text-red-500' : 'text-neutral-800'}">
              ${tx.amount !== 0 ? Math.abs(tx.amount).toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}
            </td>
            <td class="py-1.5 px-3 align-top text-right font-bold text-emerald-600">
              ${tx.payment !== 0 ? tx.payment.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}
            </td>
            <td class="py-1.5 px-3 align-top text-right font-black text-indigo-900">
              ${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}
            </td>
          </tr>
        `;
      });

      html += `
        <div class="a4-page" id="pdf-content">
          <div class="flex justify-between items-start mb-6">
            <div class="flex-grow">
              ${this.state.customLogo ? `<img src="${this.state.customLogo}" class="h-12 mb-3 object-contain">` : '<div class="h-12 w-40 bg-neutral-100 rounded mb-3 flex items-center justify-center text-[8px] text-neutral-400 border border-dashed border-neutral-300 uppercase font-black">Company Identity Logo</div>'}
              <h1 class="text-xl font-black uppercase tracking-tighter text-indigo-900">${projectName}</h1>
              <p class="text-[8px] text-indigo-500 font-black uppercase tracking-widest mt-1">InsightPRO Statement of Accounts (SOA)</p>
              
              <div class="mt-4">
                <p class="text-[8px] font-black uppercase text-neutral-400 mb-1 tracking-widest">Customer Details</p>
                <p class="text-lg font-black uppercase text-indigo-600">${clientName}</p>
                <p class="text-[9px] text-neutral-500 max-w-xs">${customer.email || ''}</p>
                <p class="text-[9px] text-neutral-500 max-w-xs">${customer.mobile || customer.phone || ''}</p>
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <h2 class="text-4xl font-black tracking-tighter leading-none text-indigo-600">SOA</h2>
              <p class="mt-2 text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400">Ref: ${new Date().toISOString().slice(0,10).replace(/-/g,'')}</p>
              <p class="mt-1 text-[9px] font-black uppercase text-neutral-400">Date: ${new Date().toLocaleDateString()}</p>
              
              <div class="mt-4 bg-indigo-600 text-white p-3 rounded-xl shadow-xl">
                <p class="text-[8px] font-black uppercase tracking-widest opacity-80 mb-1">Current Balance Due</p>
                <p class="text-2xl font-black uppercase tracking-tighter">${this.state.currency} ${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
              </div>
            </div>
          </div>
          
          <table class="w-full text-left border-collapse table-fixed master-ledger-table mb-6">
            <thead>
              <tr class="bg-indigo-600 text-white text-[8px] font-black uppercase tracking-[0.2em]">
                <th class="py-2 px-3 w-[80px]">Date</th>
                <th class="py-2 px-3 w-[120px]">Transaction</th>
                <th class="py-2 px-3 w-[220px]">Details</th>
                <th class="py-2 px-3 w-[100px] text-right">Amount</th>
                <th class="py-2 px-3 w-[100px] text-right">Payments</th>
                <th class="py-2 px-3 w-[110px] text-right">Balance</th>
              </tr>
            </thead>
            <tbody class="text-[9px] ledger-rows">
              ${rowsHtml}
            </tbody>
          </table>

          <div class="mt-auto border-t border-indigo-100 pt-4 flex justify-between items-end">
            <div class="space-y-3">
              <h4 class="text-[9px] font-black uppercase text-indigo-400 tracking-widest">Account Summary</h4>
              <div class="grid grid-cols-2 gap-x-8 gap-y-1 text-[9px] font-bold text-neutral-600 uppercase">
                <span>Opening Balance:</span><span class="text-right">${openingBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span>Invoiced Amount:</span><span class="text-right">${totalInvoiced.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span>Amount Received:</span><span class="text-right text-emerald-600">${totalReceived.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span class="pt-1 border-t font-black text-indigo-900 text-[10px]">Balance Due:</span>
                <span class="pt-1 border-t font-black text-indigo-900 text-[10px] text-right">${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>
            <div class="text-right">
              <p class="text-[9px] font-black uppercase text-indigo-500 italic">Official Account Statement</p>
              <div class="mt-4 h-10 w-40 border-b border-indigo-200 ml-auto"></div>
              <p class="mt-1 text-[8px] font-black uppercase tracking-widest text-neutral-400">Authorized Signatory</p>
            </div>
          </div>
        </div>`;
    });

    this.targets.renderArea.innerHTML = html;
    this.attachLedgerListeners();
    this.autoFitZoom();
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
    
    // Attempting to maintain balance after manual row removal
    rows.forEach(row => {
        if (row.classList.contains('ledger-item-row')) {
            const amtCell = row.children[3];
            const payCell = row.children[4];
            const runTotalCell = row.children[5];
            
            const amtRaw = amtCell.innerText.replace(/,/g, '');
            const payRaw = payCell.innerText.replace(/,/g, '');
            
            const amt = parseFloat(amtRaw) || 0;
            const pay = parseFloat(payRaw) || 0;
            
            // Invoices/Incomes are positive in column 3, CNs are negative in col 3.
            // Payments are in column 4.
            runningTotal += amt; 
            runningTotal -= pay;
            
            runTotalCell.innerText = runningTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
        }
    });
  }

  downloadExcel() {
    this.showLoading(80, "Aggregating SOA Workbook...");
    const data = [];
    const projectName = this.inputs.orgSelect.options[this.inputs.orgSelect.selectedIndex]?.text || 'N/A';

    this.state.selectedCustomerIds.forEach(id => {
      const customer = this.state.customerFullDetails[id] || {};
      const clientName = customer.contact_name || 'N/A';
      const openingBalance = parseFloat(customer.opening_balance) || 0;
      let runningBalance = openingBalance;

      // Header row
      data.push({
        'Date': '', 'Transaction': 'OPENING BALANCE', 'Details': 'Balance brought forward', 
        'Amount': 0, 'Payments': 0, 'Balance': openingBalance, 'Customer': clientName
      });

      // Prepare transactions
      let transactions = [];
      (this.state.dataStore.invoices[id]?.records || []).forEach(inv => {
        transactions.push({ date: inv.date, type: 'Invoice', ref: inv.invoice_number, amount: parseFloat(inv.total) || 0, pay: 0, sortDate: new Date(inv.date) });
      });
      (this.state.dataStore.payments[id]?.records || []).forEach(pay => {
        transactions.push({ date: pay.date, type: 'Payment', ref: pay.payment_number, amount: 0, pay: parseFloat(pay.amount) || 0, sortDate: new Date(pay.date) });
      });
      (this.state.dataStore.creditnotes[id]?.records || []).forEach(cn => {
        transactions.push({ date: cn.date, type: 'Credit Note', ref: cn.creditnote_number, amount: -(parseFloat(cn.total) || 0), pay: 0, sortDate: new Date(cn.date) });
      });

      transactions.sort((a,b) => a.sortDate - b.sortDate).forEach(tx => {
        runningBalance += tx.amount;
        runningBalance -= tx.pay;
        data.push({
          'Date': tx.date,
          'Transaction': tx.type,
          'Details': tx.ref,
          'Amount': Math.abs(tx.amount),
          'Payments': tx.pay,
          'Balance': runningBalance,
          'Customer': clientName,
          'Project': projectName
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SOA_Detailed");
    XLSX.writeFile(wb, `InsightPRO_SOA_${Date.now()}.xlsx`);
    this.hideLoading();
  }

  downloadPDF() {
    this.showLoading(85, "Generating HD Multi-Page PDF...");
    const original = document.getElementById('pdf-content');
    if (!original) return;
    
    const tempContainer = document.getElementById('pdf-export-temp');
    tempContainer.innerHTML = '';
    
    const clone = original.cloneNode(true);
    clone.style.transform = 'none';
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';
    clone.style.width = '210mm';
    
    tempContainer.appendChild(clone);
    tempContainer.classList.remove('view-hidden');
    tempContainer.style.display = 'block';

    const opt = {
      margin: [10, 0, 10, 0],
      filename: `SOA_STATEMENT_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(tempContainer).save().then(() => {
      tempContainer.classList.add('view-hidden');
      tempContainer.style.display = 'none';
      tempContainer.innerHTML = '';
      this.hideLoading();
    });
  }

  setZoom(val) {
    this.state.zoom = Math.max(0.1, Math.min(3.0, val));
    const pages = this.targets.renderArea.querySelectorAll('.a4-page');
    pages.forEach(p => { p.style.transform = `scale(${this.state.zoom})`; });
    const standardA4H_px = 29.7 * 37.8;
    const actualHeight = original => original ? original.scrollHeight * this.state.zoom : standardA4H_px;
    this.targets.renderArea.style.height = `${actualHeight(pages[0]) + 200}px`;
  }

  autoFitZoom() {
    if(!this.views.areaLedger) return;
    const wrapperW = this.views.areaLedger.clientWidth;
    const targetW = wrapperW * 0.85;
    const standardA4W_px = 21 * 37.8;
    this.setZoom(targetW / standardA4W_px);
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
    this.btns.connect.disabled = !(this.config.clientId && this.config.clientId.length > 5);
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
      this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {} };
      this.updateUIVisuals();
    }
    this.renderCustomerList();
  }
}

window.app = new ZohoLedgerApp();