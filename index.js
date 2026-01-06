
/**
 * BIZSENSE EXPERTS - LIVE ITEM STATEMENT ENGINE
 * Features: Deep Data Sync, Nested Invoice Grouping, Multi-Module Ledger
 */

class ZohoLedgerApp {
  constructor() {
    this.proxyPrefix = "https://corsproxy.io/?";
    this.config = JSON.parse(localStorage.getItem('zoho_config')) || { clientId: '', region: 'com' };
    
    this.state = {
      accessToken: localStorage.getItem('zoho_access_token'),
      organizations: [],
      selectedOrgId: localStorage.getItem('zoho_selected_org_id'),
      customers: [],
      selectedCustomerIds: new Set(),
      activeModules: new Set(['invoices']), 
      dataStore: {
        invoices: {},
        estimates: {},
        salesorders: {},
        creditnotes: {}
      },
      invoiceDetailsCache: {},
      currentView: 'ledger', 
      explorerActiveModule: 'invoices',
      sidebarOpen: false,
      statementData: [] // Structured as [{ customerName, invoices: [{ invoiceNo, date, balance, items: [] }] }]
    };

    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.cacheDOM();
      this.bindEvents();
      this.handleOAuthCallback();
      this.checkSession();
    });
  }

  cacheDOM() {
    this.views = {
      landing: document.getElementById('view-landing'),
      dashboard: document.getElementById('view-dashboard'),
      configModal: document.getElementById('modal-config'),
      loading: document.getElementById('loading-overlay'),
      landingError: document.getElementById('landing-error'),
      customerList: document.getElementById('customer-list'),
      areaLedger: document.getElementById('area-ledger'),
      areaExplorer: document.getElementById('area-explorer'),
      sidebar: document.getElementById('registry-sidebar'),
      sidebarOverlay: document.getElementById('sidebar-overlay')
    };
    
    this.inputs = {
      orgSelect: document.getElementById('select-organization'),
      search: document.getElementById('customer-search'),
      from: document.getElementById('date-from'),
      to: document.getElementById('date-to'),
      clientId: document.getElementById('cfg-client-id'),
      region: document.getElementById('cfg-region'),
      displayRedirect: document.getElementById('display-redirect-uri'),
      spanRange: document.getElementById('span-range'),
      dataRangeInfo: document.getElementById('data-range-info'),
      moduleCheckboxes: document.querySelectorAll('#module-selector input')
    };

    this.btns = {
      connect: document.getElementById('btn-connect'),
      saveConfig: document.getElementById('btn-save-config'),
      download: document.getElementById('btn-download-pdf'),
      logout: document.getElementById('btn-logout'),
      selectAll: document.getElementById('btn-select-all'),
      clearAll: document.getElementById('btn-clear-all'),
      openConfigLanding: document.getElementById('btn-open-config-landing'),
      closeConfig: document.getElementById('btn-close-config'),
      tabLedger: document.getElementById('tab-ledger'),
      tabExplorer: document.getElementById('tab-explorer'),
      tabLedgerMobile: document.getElementById('tab-ledger-mobile'),
      tabExplorerMobile: document.getElementById('tab-explorer-mobile'),
      mobileMenu: document.getElementById('btn-mobile-menu'),
      closeSidebar: document.getElementById('btn-close-sidebar'),
      mobileFilterFab: document.getElementById('btn-mobile-filter-fab')
    };

    this.targets = {
      renderArea: document.getElementById('statement-render-target'),
      explorerArea: document.getElementById('explorer-render-target'),
      explorerTabs: document.getElementById('explorer-module-tabs'),
      emptyState: document.getElementById('empty-state'),
      log: document.getElementById('log-message'),
      loadingText: document.getElementById('loading-text'),
      landingErrorText: document.getElementById('landing-error-text'),
      viewTitle: document.getElementById('view-title')
    };

    if (this.inputs.displayRedirect) {
      this.inputs.displayRedirect.innerText = window.location.origin + window.location.pathname;
    }

    const now = new Date();
    const lastYear = new Date();
    lastYear.setDate(now.getDate() - 365);
    this.inputs.from.value = lastYear.toISOString().split('T')[0];
    this.inputs.to.value = now.toISOString().split('T')[0];
  }

  bindEvents() {
    if (this.btns.connect) this.btns.connect.onclick = () => this.startAuth();
    if (this.btns.saveConfig) this.btns.saveConfig.onclick = () => this.saveConfig();
    if (this.btns.openConfigLanding) this.btns.openConfigLanding.onclick = () => this.toggleModal(true);
    if (this.btns.closeConfig) this.btns.closeConfig.onclick = () => this.toggleModal(false);
    if (this.btns.logout) this.btns.logout.onclick = () => this.logout();
    if (this.btns.download) this.btns.download.onclick = () => this.downloadPDF();
    if (this.btns.selectAll) this.btns.selectAll.onclick = () => this.toggleAllCustomers(true);
    if (this.btns.clearAll) this.btns.clearAll.onclick = () => this.toggleAllCustomers(false);

    const toggleSidebar = (force) => {
      this.state.sidebarOpen = typeof force === 'boolean' ? force : !this.state.sidebarOpen;
      this.views.sidebar.classList.toggle('open', this.state.sidebarOpen);
      this.views.sidebarOverlay.classList.toggle('open', this.state.sidebarOpen);
    };
    if (this.btns.mobileMenu) this.btns.mobileMenu.onclick = () => toggleSidebar(true);
    if (this.btns.closeSidebar) this.btns.closeSidebar.onclick = () => toggleSidebar(false);
    if (this.btns.mobileFilterFab) this.btns.mobileFilterFab.onclick = () => toggleSidebar(true);
    if (this.views.sidebarOverlay) this.views.sidebarOverlay.onclick = () => toggleSidebar(false);

    const switchV = (v) => this.switchView(v);
    if (this.btns.tabLedger) this.btns.tabLedger.onclick = () => switchV('ledger');
    if (this.btns.tabExplorer) this.btns.tabExplorer.onclick = () => switchV('explorer');
    if (this.btns.tabLedgerMobile) this.btns.tabLedgerMobile.onclick = () => switchV('ledger');
    if (this.btns.tabExplorerMobile) this.btns.tabExplorerMobile.onclick = () => switchV('explorer');

    if (this.inputs.search) this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
    
    this.inputs.moduleCheckboxes.forEach(cb => {
      cb.onchange = (e) => {
        const val = e.target.value;
        if (e.target.checked) this.state.activeModules.add(val);
        else this.state.activeModules.delete(val);
        this.syncAllActiveCustomers();
      };
    });

    if (this.inputs.orgSelect) {
      this.inputs.orgSelect.onchange = (e) => {
        this.state.selectedOrgId = e.target.value;
        localStorage.setItem('zoho_selected_org_id', e.target.value);
        this.clearDataStore();
        this.fetchCustomers();
      };
    }

    if (this.inputs.from) this.inputs.from.onchange = () => this.syncAllActiveCustomers();
    if (this.inputs.to) this.inputs.to.onchange = () => this.syncAllActiveCustomers();
  }

  clearDataStore() {
    this.state.dataStore = {
      invoices: {},
      estimates: {},
      salesorders: {},
      creditnotes: {}
    };
    this.state.invoiceDetailsCache = {};
  }

  switchView(v) {
    this.state.currentView = v;
    this.btns.tabLedger.classList.toggle('tab-active', v === 'ledger');
    this.btns.tabExplorer.classList.toggle('tab-active', v === 'explorer');
    this.btns.tabLedgerMobile.classList.toggle('tab-active', v === 'ledger');
    this.btns.tabExplorerMobile.classList.toggle('tab-active', v === 'explorer');
    this.views.areaLedger.classList.toggle('view-hidden', v !== 'ledger');
    this.views.areaExplorer.classList.toggle('view-hidden', v !== 'explorer');
    this.targets.viewTitle.innerText = v === 'ledger' ? 'Live Item Ledger Engine' : 'Data Explorer';
    if (v === 'explorer') this.renderExplorer();
  }

  toggleModal(show) {
    if (this.views.configModal) {
      this.views.configModal.classList.toggle('view-hidden', !show);
      if (show) {
        this.inputs.clientId.value = this.config.clientId;
        this.inputs.region.value = this.config.region;
      }
    }
  }

  saveConfig() {
    this.config = { clientId: this.inputs.clientId.value.trim(), region: this.inputs.region.value };
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.toggleModal(false);
  }

  startAuth() {
    if (!this.config.clientId) return this.toggleModal(true);
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.estimates.READ,ZohoBooks.salesorders.READ,ZohoBooks.creditnotes.READ,ZohoBooks.settings.READ";
    window.location.href = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent`;
  }

  handleOAuthCallback() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      this.state.accessToken = params.get('access_token');
      localStorage.setItem('zoho_access_token', this.state.accessToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  async checkSession() {
    if (this.state.accessToken) {
      this.showLoading("Waking session...");
      const success = await this.discoverOrganizations();
      if (success) {
        this.views.landing.classList.add('view-hidden');
        this.views.dashboard.classList.remove('view-hidden');
        await this.fetchCustomers();
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
          opt.value = org.organization_id;
          opt.innerText = org.name;
          this.inputs.orgSelect.appendChild(opt);
        });
        if (!this.state.selectedOrgId) this.state.selectedOrgId = res.organizations[0].organization_id;
        this.inputs.orgSelect.value = this.state.selectedOrgId;
        return true;
      }
    } catch (e) {
      this.showLandingError(e.message);
      return false;
    }
  }

  async fetchCustomers() {
    this.showLoading("Fetching Customer Registry...");
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/contacts?contact_type=customer&status=active&organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.contacts) {
        this.state.customers = res.contacts;
        this.renderCustomerList();
        this.log("Registry Synchronized.");
      }
    } catch (e) {
      this.log(`Sync Error: ${e.message}`);
    } finally {
      this.hideLoading();
    }
  }

  renderCustomerList() {
    this.views.customerList.innerHTML = '';
    this.state.customers.sort((a,b) => a.contact_name.localeCompare(b.contact_name)).forEach(c => {
      const isSelected = this.state.selectedCustomerIds.has(c.contact_id);
      const div = document.createElement('div');
      div.className = `flex items-center space-x-3 p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-all text-sm md:text-xs ${isSelected ? 'bg-indigo-500/10' : ''}`;
      div.innerHTML = `
        <div class="w-5 h-5 md:w-4 md:h-4 rounded border border-white/20 flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500' : ''}">
          ${isSelected ? '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : ''}
        </div>
        <span class="truncate font-medium">${c.contact_name}</span>
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
  }

  async syncCustomerData(id) {
    const customer = this.state.customers.find(c => c.contact_id === id);
    if (!customer) return;
    
    this.showLoading(`Syncing Items: ${customer.contact_name}`);
    const from = this.inputs.from.value;
    const to = this.inputs.to.value;

    for (const module of this.state.activeModules) {
      try {
        const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?customer_id=${id}&date_start=${from}&date_end=${to}&organization_id=${this.state.selectedOrgId}`;
        const res = await this.rawRequest(url);
        const records = res[module] || [];

        // Deep Sync required for itemized names
        if (module === 'invoices' && records.length > 0) {
          for (let i = 0; i < records.length; i++) {
            const inv = records[i];
            
            if (!this.state.invoiceDetailsCache[inv.invoice_id]) {
              this.showLoading(`Deep Sync: ${inv.invoice_number} (${i+1}/${records.length})`);
              
              // Prevent 429 errors (Rate Limit)
              await new Promise(r => setTimeout(r, 200)); 
              
              const detailUrl = `https://www.zohoapis.${this.config.region}/books/v3/invoices/${inv.invoice_id}?organization_id=${this.state.selectedOrgId}`;
              try {
                const detailRes = await this.rawRequest(detailUrl);
                if (detailRes && detailRes.invoice) {
                  this.state.invoiceDetailsCache[inv.invoice_id] = detailRes.invoice;
                }
              } catch (e) {
                console.warn(`Could not fetch details for ${inv.invoice_number}`, e);
              }
            }
          }
        }

        this.state.dataStore[module][id] = {
          customerName: customer.contact_name,
          records: records
        };
      } catch (e) {
        this.log(`Sync Fail [${module}]: ${e.message}`);
      }
    }
    this.hideLoading();
  }

  async syncAllActiveCustomers() {
    this.clearDataStore();
    const ids = Array.from(this.state.selectedCustomerIds);
    for (const id of ids) {
      await this.syncCustomerData(id);
    }
    this.recalculateAndRender();
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
    let minDate = null;
    let maxDate = null;

    this.state.selectedCustomerIds.forEach(id => {
      const invData = this.state.dataStore.invoices[id];
      if (invData && invData.records.length > 0) {
        const groupedInvoices = [];
        
        invData.records.forEach(inv => {
          const fullInv = this.state.invoiceDetailsCache[inv.invoice_id];
          const invoiceItems = [];
          
          if (fullInv && fullInv.line_items && fullInv.line_items.length > 0) {
            fullInv.line_items.forEach(li => {
              const name = li.name || li.item_name || li.description || "Service Item";
              invoiceItems.push({
                itemName: name,
                qty: li.quantity || 1,
                subTotal: li.item_total || 0
              });
            });
          } else {
            invoiceItems.push({
              itemName: `Invoice: ${inv.invoice_number} (Item Details Pending)`,
              qty: 1,
              subTotal: inv.total || 0
            });
          }

          groupedInvoices.push({
            invoiceNo: inv.invoice_number,
            date: inv.date,
            dueDate: inv.due_date,
            balance: inv.balance,
            items: invoiceItems
          });

          const d = new Date(inv.date);
          if (!minDate || d < minDate) minDate = d;
          if (!maxDate || d > maxDate) maxDate = d;
        });

        this.state.statementData.push({ 
          customerName: invData.customerName, 
          invoices: groupedInvoices 
        });
      }
    });

    if (minDate && maxDate) {
      this.inputs.dataRangeInfo.classList.remove('hidden');
      this.inputs.spanRange.innerText = `${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()}`;
    } else {
      this.inputs.dataRangeInfo.classList.add('hidden');
    }

    if (this.state.currentView === 'ledger') this.renderStatementUI();
    else this.renderExplorer();
  }

  renderExplorer() {
    const mods = Object.keys(this.state.dataStore).filter(m => {
       return Object.values(this.state.dataStore[m]).some(d => d.records.length > 0);
    });

    if (mods.length === 0) {
      this.targets.explorerArea.innerHTML = '<div class="flex items-center justify-center h-full text-neutral-600 font-black uppercase tracking-widest text-xs">No project data to explore. Select customers first.</div>';
      this.targets.explorerTabs.innerHTML = '';
      return;
    }

    if (!this.state.explorerActiveModule || !mods.includes(this.state.explorerActiveModule)) {
       this.state.explorerActiveModule = mods[0];
    }

    this.targets.explorerTabs.innerHTML = mods.map(m => `
      <button onclick="window.app.setExplorerModule('${m}')" class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${this.state.explorerActiveModule === m ? 'bg-indigo-600 text-white' : 'bg-white/5 text-neutral-500 hover:text-white'}">
        ${m}
      </button>
    `).join('');

    const data = this.state.dataStore[this.state.explorerActiveModule];
    let rows = [];
    Object.values(data).forEach(cust => {
       cust.records.forEach(rec => rows.push({ customer: cust.customerName, ...rec }));
    });

    if (rows.length === 0) {
      this.targets.explorerArea.innerHTML = `<div class="p-10 text-center text-neutral-500 text-xs">No records found for ${this.state.explorerActiveModule}</div>`;
      return;
    }

    const keys = ['customer', ...Object.keys(rows[0]).filter(k => !['customer', 'line_items', 'custom_fields'].includes(k))].slice(0, 10);
    
    let html = `<div class="overflow-x-auto"><table class="explorer-table"><thead><tr>`;
    keys.forEach(k => html += `<th>${k.replace(/_/g, ' ')}</th>`);
    html += `</tr></thead><tbody>`;
    
    rows.forEach(r => {
       html += `<tr>`;
       keys.forEach(k => html += `<td>${r[k] || '---'}</td>`);
       html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    
    this.targets.explorerArea.innerHTML = html;
  }

  setExplorerModule(m) {
    this.state.explorerActiveModule = m;
    this.renderExplorer();
  }

  renderStatementUI() {
    if (this.state.statementData.length === 0) {
      this.targets.emptyState.classList.remove('view-hidden');
      this.targets.renderArea.innerHTML = '';
      this.btns.download.disabled = true;
      return;
    }

    this.targets.emptyState.classList.add('view-hidden');
    this.btns.download.disabled = false;

    const activeOrg = this.state.organizations.find(o => o.organization_id === this.state.selectedOrgId);
    
    let html = `
      <div class="statement-view" id="pdf-content">
        <header class="flex justify-between items-end border-b-[1.5pt] border-black pb-3 mb-6">
           <div>
              <h1 class="text-xl font-black uppercase tracking-tight">${activeOrg ? activeOrg.name : 'Organization'}</h1>
              <p class="text-[8px] font-black text-neutral-500 uppercase tracking-widest mt-1">Itemized Outstanding Ledger</p>
           </div>
           <div class="text-right text-[7px] font-bold uppercase leading-tight text-neutral-600">
              <p>Period: ${this.inputs.from.value} to ${this.inputs.to.value}</p>
              <p>Generated: ${new Date().toLocaleDateString()}</p>
           </div>
        </header>

        <table class="w-full text-left border-collapse table-fixed">
          <thead>
            <tr class="border-b border-black text-[7px] font-black uppercase bg-neutral-50">
              <th class="py-1 px-1 w-[20px]">#</th>
              <th class="py-1 px-1 w-[160px]">Item Description</th>
              <th class="py-1 px-1 w-[35px] text-center">Qty</th>
              <th class="py-1 px-1 w-[80px] text-right">Amount</th>
              <th class="py-1 px-1 w-[60px] text-center">Inv #</th>
              <th class="py-1 px-1 w-[55px] text-center">Inv Date</th>
              <th class="py-1 px-1 w-[55px] text-center">Due Date</th>
              <th class="py-1 px-1 w-[80px] text-right">Inv Balance</th>
            </tr>
          </thead>
          <tbody>
    `;

    let globalIndex = 1;
    this.state.statementData.forEach(cust => {
      // Customer Header
      html += `<tr class="customer-header-row"><td colspan="8" class="py-1.5 px-2 font-black text-[9px] uppercase">Client: ${cust.customerName}</td></tr>`;
      
      cust.invoices.forEach(inv => {
        // Invoice Group Sub-Header
        html += `<tr class="bg-neutral-50 border-b border-neutral-100">
          <td colspan="4" class="py-1 px-2 font-bold text-[7px] text-indigo-600 uppercase tracking-wider">
            Invoice: ${inv.invoiceNo} (${inv.date})
          </td>
          <td colspan="4" class="py-1 px-1 text-right font-black text-[7px] uppercase">
            Outstanding Balance: ${inv.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}
          </td>
        </tr>`;

        inv.items.forEach(item => {
          html += `
            <tr class="item-row">
              <td class="py-1 px-1 text-[7px] text-neutral-400 font-mono">${globalIndex++}</td>
              <td class="py-1 px-1 font-bold truncate pl-4" contenteditable="true">${item.itemName}</td>
              <td class="py-1 px-1 text-center" contenteditable="true">${item.qty}</td>
              <td class="py-1 px-1 text-right font-medium" contenteditable="true">${item.subTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              <td class="py-1 px-1 text-center font-mono text-[7px]" contenteditable="true">${inv.invoiceNo}</td>
              <td class="py-1 px-1 text-center text-[7px]" contenteditable="true">${inv.date}</td>
              <td class="py-1 px-1 text-center text-[7px]" contenteditable="true">${inv.dueDate}</td>
              <td class="py-1 px-1 text-right font-black opacity-20" contenteditable="true">${inv.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            </tr>`;
        });
      });
    });

    html += `</tbody></table><footer class="mt-16 pt-6 border-t border-neutral-300 text-[6px] font-bold uppercase flex justify-between text-neutral-400"><div>Authorized Report | BizSense Experts ENGINE</div><div>Serial: ${Math.random().toString(36).substr(2, 8).toUpperCase()}</div></footer></div>`;
    this.targets.renderArea.innerHTML = html;
  }

  filterCustomers(term) {
    const items = this.views.customerList.querySelectorAll('div');
    items.forEach(item => {
      const name = item.innerText.toLowerCase();
      item.style.display = name.includes(term.toLowerCase()) ? 'flex' : 'none';
    });
  }

  async rawRequest(url) {
    const proxied = this.proxyPrefix + encodeURIComponent(url);
    const res = await fetch(proxied, {
      headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`, 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (res.status === 401) throw new Error("OAuth Session Expired");
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'API Call Failed' }));
      throw new Error(err.message || 'Zoho failure');
    }
    return res.json();
  }

  downloadPDF() {
    const el = document.getElementById('pdf-content');
    if (!el) return;
    this.showLoading("Rasterizing Statement...");
    html2pdf().set({
      margin: 0,
      filename: `Statement_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 3, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save().then(() => this.hideLoading());
  }

  showLoading(txt) {
    if (this.targets.loadingText) this.targets.loadingText.innerText = txt;
    if (this.views.loading) this.views.loading.classList.remove('view-hidden');
  }

  hideLoading() {
    if (this.views.loading) this.views.loading.classList.add('view-hidden');
  }

  log(m) {
    if (this.targets.log) this.targets.log.innerText = `> ${m}`;
  }

  showLandingError(m) {
    if (this.targets.landingErrorText) this.targets.landingErrorText.innerText = m;
    if (this.views.landingError) this.views.landingError.classList.remove('view-hidden');
  }

  logout() {
    localStorage.clear();
    window.location.reload();
  }
}

// Global hook for explorer tabs
window.app = new ZohoLedgerApp();
