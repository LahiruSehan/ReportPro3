
/**
 * BIZSENSE STATEMENT PRO - ENGINE CORE
 * Updated: Refined Running Balance logic (Cumulative Addition Top-to-Bottom).
 */

class ZohoLedgerApp {
  constructor() {
    this.proxyPrefix = "https://corsproxy.io/?";
    this.config = JSON.parse(localStorage.getItem('zoho_config')) || { clientId: '', region: 'com' };
    
    this.themes = {
      indigo: { primary: '#6366f1', secondary: '#f5f3ff', accent: '#818cf8', text: '#1e1b4b', border: '#e2e8f0' },
      slate: { primary: '#1e293b', secondary: '#f1f5f9', accent: '#475569', text: '#0f172a', border: '#cbd5e1' },
      emerald: { primary: '#059669', secondary: '#ecfdf5', accent: '#10b981', text: '#064e3b', border: '#d1fae5' },
      crimson: { primary: '#dc2626', secondary: '#fef2f2', accent: '#f43f5e', text: '#450a0a', border: '#fee2e2' },
      minimal: { primary: '#000000', secondary: '#fafafa', accent: '#525252', text: '#171717', border: '#e5e5e5' }
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
      currentTheme: localStorage.getItem('insight_theme') || 'indigo',
      appTheme: localStorage.getItem('app_theme') || 'bizsense',
      explorerActiveModule: 'invoices',
      sidebarOpen: false,
      statementData: [],
      zoom: 1.0
    };

    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.cacheDOM();
      this.bindEvents();
      this.applyTheme(this.state.currentTheme);
      this.applyAppTheme(this.state.appTheme);
      this.handleOAuthCallback();
      this.checkSession();
      window.addEventListener('resize', () => { if(this.state.currentView === 'ledger') this.autoFitZoom(); });
    });
  }

  cacheDOM() {
    this.views = {
      landing: document.getElementById('view-landing'),
      dashboard: document.getElementById('view-dashboard'),
      configModal: document.getElementById('modal-config'),
      reportModal: document.getElementById('modal-report'),
      settingsModal: document.getElementById('modal-settings'),
      loadingBar: document.getElementById('loading-bar-container'),
      loadingOverlay: document.getElementById('loading-status-overlay'),
      loadingProgress: document.getElementById('loading-bar'),
      loadingText: document.getElementById('loading-bar-text'),
      landingError: document.getElementById('landing-error'),
      customerList: document.getElementById('customer-list'),
      areaLedger: document.getElementById('area-ledger'),
      areaExplorer: document.getElementById('area-explorer'),
      sidebar: document.getElementById('registry-sidebar'),
      sidebarOverlay: document.getElementById('sidebar-overlay'),
      statementContainer: document.getElementById('statement-render-target')
    };
    
    this.inputs = {
      orgSelect: document.getElementById('select-organization'),
      search: document.getElementById('customer-search'),
      clientId: document.getElementById('cfg-client-id'),
      region: document.getElementById('cfg-region'),
      displayRedirect: document.getElementById('display-redirect-uri'),
      reportText: document.getElementById('report-text'),
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
      mobileFilterFab: document.getElementById('btn-mobile-filter-fab'),
      openReport: document.getElementById('btn-open-report'),
      cancelReport: document.getElementById('btn-cancel-report'),
      submitReport: document.getElementById('btn-submit-report'),
      openSettings: document.getElementById('btn-project-settings'),
      closeSettings: document.getElementById('btn-close-settings'),
      applySettings: document.getElementById('btn-apply-settings'),
      zoomIn: document.getElementById('btn-zoom-in'),
      zoomOut: document.getElementById('btn-zoom-out'),
      zoomFit: document.getElementById('btn-zoom-fit'),
      themeBiz: document.getElementById('theme-bizsense'),
      themeLight: document.getElementById('theme-light'),
      themeDark: document.getElementById('theme-dark')
    };

    this.targets = {
      renderArea: document.getElementById('statement-render-target'),
      explorerArea: document.getElementById('explorer-render-target'),
      explorerTabs: document.getElementById('explorer-module-tabs'),
      emptyState: document.getElementById('empty-state'),
      log: document.getElementById('log-message'),
      viewTitle: document.getElementById('view-title'),
      themeSelector: document.getElementById('theme-selector')
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

    const toggleSidebar = (force) => {
      this.state.sidebarOpen = typeof force === 'boolean' ? force : !this.state.sidebarOpen;
      this.views.sidebar.classList.toggle('open', this.state.sidebarOpen);
      this.views.sidebarOverlay.classList.toggle('open', this.state.sidebarOpen);
    };
    if (this.btns.mobileMenu) this.btns.mobileMenu.onclick = () => toggleSidebar(true);
    if (this.btns.closeSidebar) this.btns.closeSidebar.onclick = () => toggleSidebar(false);
    if (this.btns.mobileFilterFab) this.btns.mobileFilterFab.onclick = () => toggleSidebar(true);
    if (this.views.sidebarOverlay) this.views.sidebarOverlay.onclick = () => toggleSidebar(false);

    if (this.btns.tabLedger) this.btns.tabLedger.onclick = () => this.switchView('ledger');
    if (this.btns.tabExplorer) this.btns.tabExplorer.onclick = () => this.switchView('explorer');
    if (this.btns.tabLedgerMobile) this.btns.tabLedgerMobile.onclick = () => this.switchView('ledger');
    if (this.btns.tabExplorerMobile) this.btns.tabExplorerMobile.onclick = () => this.switchView('explorer');

    if (this.btns.openReport) this.btns.openReport.onclick = () => this.views.reportModal.classList.remove('view-hidden');
    if (this.btns.cancelReport) this.btns.cancelReport.onclick = () => this.views.reportModal.classList.add('view-hidden');
    if (this.btns.submitReport) this.btns.submitReport.onclick = () => this.reportIssue();

    if (this.btns.zoomIn) this.btns.zoomIn.onclick = () => this.setZoom(this.state.zoom + 0.1);
    if (this.btns.zoomOut) this.btns.zoomOut.onclick = () => this.setZoom(this.state.zoom - 0.1);
    if (this.btns.zoomFit) this.btns.zoomFit.onclick = () => this.autoFitZoom();

    if (this.btns.themeBiz) this.btns.themeBiz.onclick = () => this.applyAppTheme('bizsense');
    if (this.btns.themeLight) this.btns.themeLight.onclick = () => this.applyAppTheme('light');
    if (this.btns.themeDark) this.btns.themeDark.onclick = () => this.applyAppTheme('dark');

    if (this.inputs.search) this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
    
    this.targets.themeSelector.onclick = (e) => {
      const theme = e.target.getAttribute('data-theme');
      if (theme) this.applyTheme(theme);
    };

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

  setZoom(val) {
    this.state.zoom = Math.max(0.05, Math.min(4.0, val));
    if (this.views.statementContainer) {
      this.views.statementContainer.style.transform = `scale(${this.state.zoom})`;
    }
  }

  autoFitZoom() {
    const wrapper = this.views.areaLedger;
    if (!wrapper) return;
    const padding = window.innerWidth < 1024 ? 40 : 120;
    const w = wrapper.clientWidth - padding;
    const targetW = 21 * 37.8; 
    this.setZoom(w / targetW);
  }

  applyAppTheme(theme) {
    this.state.appTheme = theme;
    localStorage.setItem('app_theme', theme);
    document.documentElement.setAttribute('data-app-theme', theme);
    const themes = [this.btns.themeBiz, this.btns.themeLight, this.btns.themeDark];
    themes.forEach(t => {
      const active = t.id.includes(theme);
      t.classList.toggle('bg-indigo-500', active);
      t.classList.toggle('text-white', active);
      if (!active) {
        t.classList.remove('bg-indigo-500', 'text-white');
        t.classList.add('text-neutral-500');
      }
    });
  }

  reportIssue() {
    const text = this.inputs.reportText.value.trim();
    if (!text) return alert("Describe the problem.");
    const url = `https://wa.me/94715717171?text=${encodeURIComponent("BIZSENSE PRO ALERT: " + text)}`;
    window.open(url, '_blank');
    this.views.reportModal.classList.add('view-hidden');
    this.inputs.reportText.value = '';
  }

  applyTheme(themeKey) {
    this.state.currentTheme = themeKey;
    localStorage.setItem('insight_theme', themeKey);
    const theme = this.themes[themeKey];
    document.documentElement.style.setProperty('--theme-primary', theme.primary);
    document.documentElement.style.setProperty('--theme-secondary', theme.secondary);
    document.documentElement.style.setProperty('--theme-accent', theme.accent);
    document.documentElement.style.setProperty('--theme-text-dark', theme.text);
    document.documentElement.style.setProperty('--theme-border', theme.border);
    this.targets.themeSelector.querySelectorAll('.theme-swatch').forEach(s => {
      s.classList.toggle('active', s.getAttribute('data-theme') === themeKey);
    });
    if (this.state.statementData.length > 0) this.renderStatementUI();
  }

  clearDataStore() {
    this.state.dataStore = { invoices: {}, estimates: {}, salesorders: {}, creditnotes: {} };
    this.state.invoiceDetailsCache = {};
  }

  switchView(v) {
    this.state.currentView = v;
    const btns = [this.btns.tabLedger, this.btns.tabExplorer, this.btns.tabLedgerMobile, this.btns.tabExplorerMobile];
    btns.forEach(b => {
      if (b) {
        const active = b.id.includes(v);
        b.classList.toggle('tab-active', active);
        if (!active) b.classList.add('text-neutral-500'); else b.classList.remove('text-neutral-500');
      }
    });
    this.views.areaLedger.classList.toggle('view-hidden', v !== 'ledger');
    this.views.areaExplorer.classList.toggle('view-hidden', v !== 'explorer');
    this.targets.viewTitle.innerText = v === 'ledger' ? 'BIZSENSE STATEMENT PRO' : 'Data Explorer';
    if (v === 'explorer') this.renderExplorer();
    else this.autoFitZoom();
  }

  toggleModal(show) {
    this.views.configModal.classList.toggle('view-hidden', !show);
    if (show) {
      this.inputs.clientId.value = this.config.clientId;
      this.inputs.region.value = this.config.region;
    }
  }

  saveConfig() {
    this.config = { clientId: this.inputs.clientId.value.trim(), region: this.inputs.region.value };
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.toggleModal(false);
    this.startAuth();
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
      this.showLoading(15, "Initializing Data Pipeline...");
      const success = await this.discoverOrganizations();
      if (success) {
        this.views.landing.classList.add('view-hidden');
        this.views.dashboard.classList.remove('view-hidden');
        await this.fetchOrganizationDetails();
        await this.fetchCustomers();
        this.autoFitZoom();
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

  async fetchOrganizationDetails() {
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/settings/organization?organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.organization) {
        this.state.currentOrgDetails = res.organization;
      }
    } catch (e) {
      const basicOrg = this.state.organizations.find(o => o.organization_id === this.state.selectedOrgId);
      if (basicOrg) this.state.currentOrgDetails = basicOrg;
    }
  }

  async fetchCustomers() {
    this.showLoading(35, "Ingesting Customer Registry...");
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/contacts?contact_type=customer&status=active&organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.contacts) {
        this.state.customers = res.contacts;
        this.renderCustomerList();
        this.log("Registry Online.");
      }
    } catch (e) {
      this.log(`Critical Error: ${e.message}`);
    } finally {
      this.hideLoading();
    }
  }

  renderCustomerList() {
    this.views.customerList.innerHTML = '';
    this.state.customers.sort((a,b) => a.contact_name.localeCompare(b.contact_name)).forEach(c => {
      const isSelected = this.state.selectedCustomerIds.has(c.contact_id);
      const div = document.createElement('div');
      div.className = `flex items-center space-x-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-all text-[11px] group ${isSelected ? 'bg-indigo-500/10 border border-indigo-500/20' : 'border border-transparent'}`;
      div.innerHTML = `
        <div class="w-4 h-4 rounded border border-white/20 flex items-center justify-center group-hover:border-indigo-500 ${isSelected ? 'bg-indigo-500 border-indigo-500' : ''}">
          ${isSelected ? '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
        </div>
        <span class="truncate font-semibold tracking-tight text-neutral-400 group-hover:text-white transition-colors">${c.contact_name}</span>
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
    
    this.showLoading(45, `Parsing Data: ${customer.contact_name}`);
    for (const module of this.state.activeModules) {
      try {
        const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?customer_id=${id}&organization_id=${this.state.selectedOrgId}`;
        const res = await this.rawRequest(url);
        const records = res[module] || [];

        if (module === 'invoices' && records.length > 0) {
          for (let i = 0; i < records.length; i++) {
            const inv = records[i];
            if (!this.state.invoiceDetailsCache[inv.invoice_id]) {
              const prog = 45 + ((i / records.length) * 50);
              this.showLoading(prog, `Syncing Details: ${inv.invoice_number}`);
              await new Promise(r => setTimeout(r, 150)); 
              const detailUrl = `https://www.zohoapis.${this.config.region}/books/v3/invoices/${inv.invoice_id}?organization_id=${this.state.selectedOrgId}`;
              try {
                const detailRes = await this.rawRequest(detailUrl);
                if (detailRes && detailRes.invoice) this.state.invoiceDetailsCache[inv.invoice_id] = detailRes.invoice;
              } catch (e) { console.warn(e); }
            }
          }
        }
        this.state.dataStore[module][id] = { customerName: customer.contact_name, records: records };
      } catch (e) { this.log(`Module Error: ${e.message}`); }
    }
    this.hideLoading();
  }

  async syncAllActiveCustomers() {
    this.clearDataStore();
    const ids = Array.from(this.state.selectedCustomerIds);
    for (const id of ids) await this.syncCustomerData(id);
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
          const invoiceItems = [];
          if (fullInv && fullInv.line_items) {
            fullInv.line_items.forEach(li => {
              invoiceItems.push({
                itemName: li.name || li.item_name || li.description || "Service Item",
                qty: li.quantity || 1,
                subTotal: li.item_total || 0
              });
            });
          } else {
            invoiceItems.push({ itemName: `Syncing Item Data (${inv.invoice_number})...`, qty: 1, subTotal: inv.total || 0 });
          }
          groupedInvoices.push({ 
            invoiceNo: inv.invoice_number, 
            date: inv.date, 
            dueDate: inv.due_date, 
            total: inv.total,
            balance: inv.balance, 
            items: invoiceItems 
          });
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
      this.targets.explorerArea.innerHTML = '<div class="h-40 flex items-center justify-center text-neutral-600 text-[10px] uppercase font-black tracking-widest">No Active Module Data</div>';
      this.targets.explorerTabs.innerHTML = ''; return;
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
    if (rows.length === 0) return;
    const keys = ['client', ...Object.keys(rows[0]).filter(k => !['client', 'line_items'].includes(k))].slice(0, 10);
    let html = `<table class="w-full text-left text-[9px]"><thead class="border-b border-white/10"><tr>${keys.map(k => `<th class="p-2 uppercase opacity-50 font-black">${k}</th>`).join('')}</tr></thead><tbody>`;
    rows.forEach(r => html += `<tr class="border-b border-white/5">${keys.map(k => `<td class="p-2">${r[k] || '---'}</td>`).join('')}</tr>`);
    html += `</tbody></table>`;
    this.targets.explorerArea.innerHTML = html;
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

    let html = `
      <div class="statement-view font-inter" id="pdf-content">
        <div class="flex justify-between items-start mb-12">
          <div class="flex items-center space-x-4">
            <div>
              <h1 class="text-2xl font-black uppercase tracking-tighter leading-none">${org.name || 'Organization'}</h1>
              <p class="text-[9px] text-neutral-500 font-bold uppercase mt-2">Outstanding Client Ledger</p>
            </div>
          </div>
          <div class="text-right">
            <h2 class="text-3xl font-black theme-accent-text tracking-tighter leading-none">STATEMENT</h2>
            <div class="mt-4 text-[8px] font-black text-neutral-400 uppercase tracking-widest">
              <p>Issue Date: <span class="text-black">${new Date().toLocaleDateString()}</span></p>
            </div>
          </div>
        </div>
        <table class="w-full text-left border-collapse table-fixed">
          <thead>
            <tr class="theme-accent-bg text-[8px] font-black uppercase tracking-widest">
              <th class="py-2.5 px-3 w-[25px]">#</th>
              <th class="py-2.5 px-3 w-[160px]">Description</th>
              <th class="py-2.5 px-3 w-[45px] text-center">Qty</th>
              <th class="py-2.5 px-3 w-[95px] text-right">Amount</th>
              <th class="py-2.5 px-3 w-[70px] text-center">Ref</th>
              <th class="py-2.5 px-3 w-[95px] text-right">Balance</th>
            </tr>
          </thead>
          <tbody class="text-[9px]">
    `;
    let globalCounter = 1;
    this.state.statementData.forEach(cust => {
      const clientTotalOS = cust.invoices.reduce((sum, inv) => sum + inv.balance, 0);

      html += `<tr class="theme-row-bg border-b-2 theme-border-color">
        <td colspan="4" class="py-3 px-3 font-black text-[11px] uppercase tracking-tighter">Client: ${cust.customerName}</td>
        <td colspan="2" class="py-3 px-3 text-right font-black text-[11px] uppercase tracking-tighter">Total O/S: ${clientTotalOS.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>`;
      
      cust.invoices.forEach(inv => {
        // RESET runningBalance to 0 for addition from top to bottom
        let runningBalance = 0;
        
        html += `<tr class="border-b border-neutral-200 bg-neutral-50/50">
          <td colspan="6" class="py-2 px-3 font-bold text-neutral-400 uppercase italic">Invoice: ${inv.invoiceNo} (${inv.date})</td>
        </tr>`;

        inv.items.forEach(item => {
          // ADDITION FROM TOP TO BOTTOM logic
          runningBalance += item.subTotal;

          html += `<tr class="item-row border-b border-neutral-100">
            <td class="py-2 px-3 text-[8px] opacity-25 font-mono">${globalCounter++}</td>
            <td class="py-2 px-3 font-bold truncate" contenteditable="true">${item.itemName}</td>
            <td class="py-2 px-3 text-center" contenteditable="true">${item.qty}</td>
            <td class="py-2 px-3 text-right font-semibold" contenteditable="true">${item.subTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td class="py-2 px-3 text-center text-[8px] font-mono opacity-50" contenteditable="true">${inv.invoiceNo}</td>
            <td class="py-2 px-3 text-right font-black text-neutral-800" contenteditable="true">${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          </tr>`;
        });

        html += `<tr class="border-t border-neutral-300">
          <td colspan="5" class="py-2 px-3 text-right font-bold text-neutral-500 uppercase">Inv. Outstanding Total:</td>
          <td class="py-2 px-3 text-right font-black text-[10px] text-indigo-600">${inv.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        </tr>
        <tr class="h-4"></tr>`; 
      });
    });
    html += `</tbody></table>
        <div class="mt-20 pt-10 border-t-[4pt] theme-border-color flex justify-between">
          <div><p class="text-[7.5px] font-black text-neutral-400 uppercase tracking-widest">Authentication Integrity Key</p><div class="mt-4 font-mono text-[9px] text-neutral-300">#${Math.random().toString(36).substr(2, 14).toUpperCase()}</div></div>
          <div class="text-right"><p class="text-[7.5px] font-black text-neutral-400 uppercase tracking-widest">Authorized Signature</p><p class="mt-4 text-sm font-black italic tracking-tighter uppercase">${org.name || 'Financial Operations'}</p></div>
        </div>
      </div>`;
    this.targets.renderArea.innerHTML = html;
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
    }, 1000);
  }

  filterCustomers(term) {
    this.views.customerList.querySelectorAll('div').forEach(item => {
      const name = item.innerText.toLowerCase();
      item.style.display = name.includes(term.toLowerCase()) ? 'flex' : 'none';
    });
  }

  async rawRequest(url) {
    const res = await fetch(this.proxyPrefix + encodeURIComponent(url), {
      headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`, 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (res.status === 401) throw new Error("Auth Expired");
    if (!res.ok) throw new Error('API Rejection');
    return res.json();
  }

  downloadPDF() {
    const el = document.getElementById('pdf-content');
    if (!el) return;
    this.showLoading(85, "PRE-RENDERING DOCUMENT...");
    html2pdf().set({
      margin: 0, filename: `Ledger_Report_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: { scale: 3.5, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save().then(() => this.hideLoading());
  }

  log(m) { this.targets.log.innerText = `READY: ${m.toUpperCase()}`; }
  showLandingError(m) { this.targets.landingErrorText.innerText = m; this.views.landingError.classList.remove('view-hidden'); }
  logout() { localStorage.clear(); window.location.reload(); }
}

window.app = new ZohoLedgerApp();
