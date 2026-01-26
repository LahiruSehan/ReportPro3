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
      customerFullDetails: {}, 
      selectedCustomerIds: new Set(),
      activeModules: new Set(JSON.parse(localStorage.getItem('active_modules')) || ['invoices', 'creditnotes', 'payments']), 
      dataStore: { invoices: {}, creditnotes: {}, payments: {} },
      invoiceDetailsCache: {},
      customLogo: localStorage.getItem('biz_logo') || null,
      zoom: 0.75,
      activeView: 'ledger',
      explorerModule: 'invoices',
      currency: 'LKR', // Will be dynamic
      theme: 'indigo', 
      isSummaryMode: false,
      filterDateStart: null,
      filterDateEnd: null,
      notesContent: localStorage.getItem('biz_notes') || "Please ensure payment is made by the due date. Thank you for your business.",
      colors: [
        { name: 'indigo', hex: '#4f46e5' },
        { name: 'blue', hex: '#2563eb' },
        { name: 'emerald', hex: '#059669' },
        { name: 'rose', hex: '#e11d48' },
        { name: 'amber', hex: '#d97706' },
        { name: 'slate', hex: '#475569' },
        { name: 'cyan', hex: '#06b6d4' },
        { name: 'violet', hex: '#8b5cf6' },
        { name: 'fuchsia', hex: '#d946ef' }
      ],
      quotes: [
        "\"Revenue is vanity, profit is sanity, but cash is king.\"",
        "\"Opportunities don't happen. You create them.\"",
        "\"Success usually comes to those who are too busy to be looking for it.\"",
        "\"Don't count the days, make the days count.\"",
        "\"The best way to predict the future is to create it.\"",
        "\"Quality means doing it right when no one is looking.\""
      ]
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
      this.renderColorPicker(); 
      this.updateConfigStatus();
      this.checkSession();
      this.initLandingUI(); // Start landing animations
      setTimeout(() => this.autoFitZoom(), 1000);
      window.addEventListener('resize', () => this.autoFitZoom());
      
      // Inject No-Scrollbar Style for Preview Area
      const style = document.createElement('style');
      style.innerHTML = `
        #area-ledger::-webkit-scrollbar { display: none; }
        #area-ledger { -ms-overflow-style: none; scrollbar-width: none; }
      `;
      document.head.appendChild(style);
      
      // Keyboard Navigation
      document.addEventListener('keydown', (e) => this.handleKeyboardNav(e));
    });
  }

  initLandingUI() {
    // 1. Background Slideshow Logic
    const bgContainer = document.getElementById('bg-slideshow');
    if (!bgContainer) return;

    const images = [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop', // Sky
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop', // Data
      'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=2032&auto=format&fit=crop', // Meeting
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=2011&auto=format&fit=crop', // Finance
      'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop'  // Office
    ];

    // Inject images
    bgContainer.innerHTML = '';
    images.forEach((url, i) => {
        const div = document.createElement('div');
        div.className = `bg-slide ${i === 0 ? 'active' : ''}`;
        div.style.backgroundImage = `url(${url})`;
        bgContainer.appendChild(div);
    });

    // Rotate Backgrounds
    let currentSlide = 0;
    setInterval(() => {
        const slides = document.querySelectorAll('.bg-slide');
        if (slides.length > 0) {
            slides[currentSlide].classList.remove('active');
            currentSlide = (currentSlide + 1) % slides.length;
            slides[currentSlide].classList.add('active');
        }
    }, 4000); // 4 seconds

    // 2. Rotate Quotes
    const quoteEl = document.getElementById('business-quote');
    if (quoteEl) {
        let qIdx = 0;
        setInterval(() => {
            qIdx = (qIdx + 1) % this.state.quotes.length;
            quoteEl.style.opacity = '0';
            setTimeout(() => {
                quoteEl.innerText = this.state.quotes[qIdx];
                quoteEl.style.opacity = '1';
            }, 500); // Wait for fade out
        }, 5000); // 5 seconds
    }
  }

  cacheDOM() {
    this.views = {
      landing: document.getElementById('view-landing'),
      dashboard: document.getElementById('view-dashboard'),
      configModal: document.getElementById('modal-config'),
      settingsModal: document.getElementById('modal-settings'),
      loadingContainer: document.getElementById('loading-container'),
      loadingProgress: document.getElementById('loading-progress'),
      loadingText: document.getElementById('loading-text'),
      landingError: document.getElementById('landing-error'),
      customerList: document.getElementById('customer-list'),
      areaLedger: document.getElementById('area-ledger'),
      statementContainer: document.getElementById('statement-render-target'),
      skeletonLoader: document.getElementById('skeleton-loader'),
      ledgerView: document.getElementById('view-ledger-container'),
      explorerView: document.getElementById('view-explorer-container'),
      bgSlideshow: document.getElementById('bg-slideshow')
    };
    
    this.inputs = {
      orgSelect: document.getElementById('select-organization'),
      search: document.getElementById('customer-search'),
      clientId: document.getElementById('cfg-client-id'),
      region: document.getElementById('cfg-region'),
      displayRedirect: document.getElementById('display-redirect-uri'),
      moduleCheckboxes: document.querySelectorAll('#module-selector input'),
      logoUpload: document.getElementById('logo-upload'),
      dateRangePreset: document.getElementById('date-range-preset'),
      dateStart: document.getElementById('date-start'),
      dateEnd: document.getElementById('date-end'),
      toggleSummary: document.getElementById('toggle-summary')
    };

    this.btns = {
      connect: document.getElementById('btn-connect'),
      saveConfig: document.getElementById('btn-save-config'),
      resetConfig: document.getElementById('btn-reset-config'),
      print: document.getElementById('btn-print'),
      downloadPdf: document.getElementById('btn-download-pdf'),
      downloadExcel: document.getElementById('btn-download-excel'),
      emailComposer: document.getElementById('btn-email-composer'),
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
      explorerTbody: document.getElementById('explorer-tbody'),
      colorPicker: document.getElementById('color-theme-picker')
    };

    const redirectUri = window.location.origin + window.location.pathname;
    if (this.inputs.displayRedirect) this.inputs.displayRedirect.innerText = redirectUri;
    this.inputs.moduleCheckboxes.forEach(cb => {
        if (this.state.activeModules.has(cb.value)) cb.checked = true;
    });
  }

  bindEvents() {
    if(this.btns.connect) this.btns.connect.onclick = () => this.startAuth();
    if(this.btns.saveConfig) this.btns.saveConfig.onclick = () => this.saveConfig();
    if(this.btns.resetConfig) this.btns.resetConfig.onclick = () => this.wipeConfiguration();
    if(this.btns.openConfig) this.btns.openConfig.onclick = () => this.toggleConfig(true);
    if(this.btns.closeConfig) this.btns.closeConfig.onclick = () => this.toggleConfig(false);
    if(this.btns.logout) this.btns.logout.onclick = () => this.logout();
    if(this.btns.print) this.btns.print.onclick = () => this.printReport();
    if(this.btns.downloadPdf) this.btns.downloadPdf.onclick = () => this.downloadPDF();
    if(this.btns.downloadExcel) this.btns.downloadExcel.onclick = () => this.downloadExcel();
    if(this.btns.emailComposer) this.btns.emailComposer.onclick = () => this.openEmailComposer();
    
    // Safety checks for optional buttons
    if(this.btns.selectAll) {
        this.btns.selectAll.style.display = 'none'; // Ensure hidden if exists
        this.btns.selectAll.onclick = () => this.toggleAllCustomers(true);
    }
    if(this.btns.clearAll) this.btns.clearAll.onclick = () => this.toggleAllCustomers(false);
    
    if(this.btns.openSettings) this.btns.openSettings.onclick = () => this.views.settingsModal.classList.remove('view-hidden');
    if(this.btns.closeSettings) this.btns.closeSettings.onclick = () => this.views.settingsModal.classList.add('view-hidden');
    
    if(this.btns.toggleLedger) this.btns.toggleLedger.onclick = () => this.switchView('ledger');
    if(this.btns.toggleExplorer) this.btns.toggleExplorer.onclick = () => this.switchView('explorer');

    if(this.btns.applySettings) {
        this.btns.applySettings.onclick = () => {
          this.state.activeModules.clear();
          this.inputs.moduleCheckboxes.forEach(cb => { if(cb.checked) this.state.activeModules.add(cb.value); });
          localStorage.setItem('active_modules', JSON.stringify(Array.from(this.state.activeModules)));
          this.views.settingsModal.classList.add('view-hidden');
          this.syncAllActiveCustomers();
        };
    }

    if(this.btns.zoomIn) this.btns.zoomIn.onclick = () => this.setZoom(this.state.zoom + 0.1);
    if(this.btns.zoomOut) this.btns.zoomOut.onclick = () => this.setZoom(this.state.zoom - 0.1);
    if(this.btns.zoomFit) this.btns.zoomFit.onclick = () => this.autoFitZoom();
    
    if(this.inputs.search) this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
    if(this.inputs.logoUpload) this.inputs.logoUpload.onchange = (e) => this.handleLogoUpload(e);
    if(this.inputs.orgSelect) this.inputs.orgSelect.onchange = (e) => this.handleOrgSwitch(e.target.value);
    
    // Feature: Date Filter
    if(this.inputs.dateRangePreset) this.inputs.dateRangePreset.onchange = (e) => this.handleDatePreset(e.target.value);
    if(this.inputs.dateStart) this.inputs.dateStart.onchange = () => this.updateDateFilter();
    if(this.inputs.dateEnd) this.inputs.dateEnd.onchange = () => this.updateDateFilter();
    
    // Feature: Summary Toggle
    if(this.inputs.toggleSummary) {
        this.inputs.toggleSummary.onchange = (e) => {
            this.state.isSummaryMode = !this.state.isSummaryMode;
            this.renderStatementUI();
        };
    }
  }

  handleKeyboardNav(e) {
    if (this.state.activeView !== 'ledger' || this.state.customers.length === 0) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

    e.preventDefault();
    const currentId = Array.from(this.state.selectedCustomerIds)[0];
    let idx = this.state.customers.findIndex(c => c.contact_id === currentId);
    
    if (e.key === 'ArrowDown') idx = idx < this.state.customers.length - 1 ? idx + 1 : 0;
    if (e.key === 'ArrowUp') idx = idx > 0 ? idx - 1 : this.state.customers.length - 1;
    
    const nextCustomer = this.state.customers[idx];
    if (nextCustomer) this.handleCustomerClick(nextCustomer.contact_id);
  }

  handleDatePreset(val) {
    const now = new Date();
    const container = document.getElementById('custom-date-container');
    if(container) container.classList.add('hidden');
    
    if (val === 'all') {
        this.state.filterDateStart = null;
        this.state.filterDateEnd = null;
    } else if (val === 'this_month') {
        this.state.filterDateStart = new Date(now.getFullYear(), now.getMonth(), 1);
        this.state.filterDateEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (val === 'last_month') {
        this.state.filterDateStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        this.state.filterDateEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (val === 'this_year') {
        this.state.filterDateStart = new Date(now.getFullYear(), 0, 1);
        this.state.filterDateEnd = new Date(now.getFullYear(), 11, 31);
    } else if (val === 'custom') {
        if(container) container.classList.remove('hidden');
        return; 
    }
    this.renderStatementUI();
  }

  updateDateFilter() {
    const s = this.inputs.dateStart ? this.inputs.dateStart.value : null;
    const e = this.inputs.dateEnd ? this.inputs.dateEnd.value : null;
    if (s) this.state.filterDateStart = new Date(s);
    if (e) this.state.filterDateEnd = new Date(e);
    this.renderStatementUI();
  }

  renderColorPicker() {
    if(!this.targets.colorPicker) return;
    this.targets.colorPicker.innerHTML = '';
    this.state.colors.forEach(c => {
      const ball = document.createElement('div');
      ball.className = `w-5 h-5 rounded-full color-ball border border-white/20 ${this.state.theme === c.name ? 'ring-2 ring-white' : ''}`;
      ball.style.backgroundColor = c.hex;
      ball.title = c.name.toUpperCase();
      ball.onclick = () => {
        this.state.theme = c.name;
        this.renderColorPicker(); // Update active ring
        this.renderStatementUI(); // Re-render with new colors
      };
      this.targets.colorPicker.appendChild(ball);
    });
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
    
    // Hide bg in dashboard
    if(this.views.bgSlideshow) {
        if(view === 'ledger' || view === 'explorer') this.views.bgSlideshow.classList.add('view-hidden');
    }

    if(this.btns.toggleLedger) {
        this.btns.toggleLedger.classList.toggle('bg-indigo-600', view === 'ledger');
        this.btns.toggleLedger.classList.toggle('text-white', view === 'ledger');
        this.btns.toggleLedger.classList.toggle('text-neutral-500', view !== 'ledger');
    }
    
    if(this.btns.toggleExplorer) {
        this.btns.toggleExplorer.classList.toggle('bg-indigo-600', view === 'explorer');
        this.btns.toggleExplorer.classList.toggle('text-white', view === 'explorer');
        this.btns.toggleExplorer.classList.toggle('text-neutral-500', view !== 'explorer');
    }

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
          // Hide BG on successful login
          if(this.views.bgSlideshow) this.views.bgSlideshow.classList.add('view-hidden');
          
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
        if(this.inputs.orgSelect) {
            this.inputs.orgSelect.innerHTML = '';
            res.organizations.forEach(org => {
              const opt = document.createElement('option');
              opt.value = org.organization_id; opt.innerText = org.name;
              this.inputs.orgSelect.appendChild(opt);
            });
            if (!this.state.selectedOrgId) this.state.selectedOrgId = res.organizations[0].organization_id;
            this.inputs.orgSelect.value = this.state.selectedOrgId;
        }
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
    if (!this.config.clientId || this.config.clientId.length < 3) {
        this.showLandingError("Configuration Missing: Client ID required.");
        this.toggleConfig(true);
        return;
    }
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
    if(!this.views.customerList) return;
    this.views.customerList.innerHTML = '';
    this.state.customers.sort((a,b) => a.contact_name.localeCompare(b.contact_name)).forEach(c => {
      const isSelected = this.state.selectedCustomerIds.has(c.contact_id);
      
      // LOGIC FOR TAGS
      let tagHtml = '';
      const balance = parseFloat(c.outstanding_receivable_amount || 0);
      const credits = parseFloat(c.unused_credits_receivable_amount || 0);

      if (balance > 0) {
        tagHtml = `<span class="mt-1 px-1.5 py-0.5 bg-red-900/30 text-red-400 border border-red-500/30 text-[7px] font-black rounded uppercase inline-block">DUE ${balance.toLocaleString()}</span>`;
      } else if (credits > 0) {
        tagHtml = `<span class="mt-1 px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400 border border-yellow-500/30 text-[7px] font-black rounded uppercase inline-block">CREDIT ${credits.toLocaleString()}</span>`;
      } else {
        tagHtml = `<span class="mt-1 px-1.5 py-0.5 bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 text-[7px] font-black rounded uppercase inline-block">PAID</span>`;
      }

      const div = document.createElement('div');
      div.className = `flex items-start space-x-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-all group ${isSelected ? 'bg-indigo-500/10 border border-indigo-500/20' : 'border border-transparent'}`;
      div.innerHTML = `
        <div class="mt-0.5 w-4 h-4 rounded border border-white/20 flex-shrink-0 flex items-center justify-center group-hover:border-indigo-500 ${isSelected ? 'bg-indigo-500 border-indigo-500' : ''}">
          ${isSelected ? '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
        </div>
        <div class="flex flex-col overflow-hidden">
            <span class="truncate font-black uppercase text-[9px] text-neutral-400 group-hover:text-white tracking-widest">${c.contact_name}</span>
            ${tagHtml}
        </div>
      `;
      div.onclick = () => this.handleCustomerClick(c.contact_id);
      this.views.customerList.appendChild(div);
    });
  }

  async handleCustomerClick(id) {
    if (this.state.selectedCustomerIds.has(id)) {
        this.state.selectedCustomerIds.delete(id);
        this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {} };
    } else {
        this.state.selectedCustomerIds.clear();
        this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {} }; 
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
    if(this.targets.stats) this.targets.stats.innerText = `${totalRecords} RECORDS MAPPED`;
  }

  async syncCustomerData(id) {
    const customer = this.state.customers.find(c => c.contact_id === id);
    if (!customer) return;
    this.showLoading(50, `Mapping SOA Data: ${customer.contact_name}`);
    
    try {
        const cRes = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/contacts/${id}?organization_id=${this.state.selectedOrgId}`);
        this.state.customerFullDetails[id] = cRes.contact;
        // Feature: Dynamic Currency
        this.state.currency = cRes.contact.currency_symbol || cRes.contact.currency_code || 'LKR';
    } catch(e) { console.warn("SOA Context fetch failed", e); }

    const modulesToSync = ['invoices', 'creditnotes', 'customerpayments']; 
    
    for (const module of modulesToSync) {
      try {
        const url = `https://www.zohoapis.${this.config.region}/books/v3/${module}?customer_id=${id}&organization_id=${this.state.selectedOrgId}`;
        const res = await this.rawRequest(url);
        const storageKey = module === 'customerpayments' ? 'payments' : module;
        this.state.dataStore[storageKey][id] = { customerName: customer.contact_name, records: res[module] || [] };
        
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
    if(!this.targets.explorerTabs) return;
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
      if(this.btns.downloadPdf) this.btns.downloadPdf.disabled = true;
      if(this.btns.downloadExcel) this.btns.downloadExcel.disabled = true;
      if(this.btns.print) this.btns.print.disabled = true;
      return;
    }
    this.targets.emptyState.classList.add('view-hidden');
    if(this.btns.downloadPdf) this.btns.downloadPdf.disabled = false;
    if(this.btns.downloadExcel) this.btns.downloadExcel.disabled = false;
    if(this.btns.print) this.btns.print.disabled = false;

    const theme = this.state.theme;
    const projectName = this.inputs.orgSelect && this.inputs.orgSelect.options[this.inputs.orgSelect.selectedIndex] ? this.inputs.orgSelect.options[this.inputs.orgSelect.selectedIndex].text : 'Project Context N/A';
    
    let html = '';

    this.state.selectedCustomerIds.forEach(id => {
      const customer = this.state.customerFullDetails[id] || {};
      const clientName = customer.contact_name || 'Valued Client';
      const systemOpeningBalance = parseFloat(customer.opening_balance) || 0;
      
      let runningBalance = systemOpeningBalance;
      let balanceBroughtForward = systemOpeningBalance; // For filtered view
      
      let totalInvoiced = 0;
      let totalReceived = 0;
      let totalCredits = 0;

      // Feature: Trend Chart Data
      let monthlyBalances = {};

      let transactions = [];
      
      // 1. Collect
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

      (this.state.dataStore.creditnotes[id]?.records || []).forEach(cn => {
        transactions.push({
          date: cn.date,
          type: 'Credit Note',
          ref: cn.creditnote_number,
          amount: 0, 
          payment: parseFloat(cn.total) || 0, 
          raw: cn,
          sortDate: new Date(cn.date)
        });
      });

      transactions.sort((a,b) => a.sortDate - b.sortDate);

      // Feature: Date Filter Calculations
      if (this.state.filterDateStart) {
          // Calculate opening balance for the filtered period by simulating ledger up to start date
          let tempBal = systemOpeningBalance;
          const preTx = transactions.filter(t => t.sortDate < this.state.filterDateStart);
          preTx.forEach(t => {
              tempBal += t.amount;
              tempBal -= t.payment;
          });
          balanceBroughtForward = tempBal;
          // Filter transactions for display
          transactions = transactions.filter(t => t.sortDate >= this.state.filterDateStart && (!this.state.filterDateEnd || t.sortDate <= this.state.filterDateEnd));
          runningBalance = balanceBroughtForward; // Start running balance from new point
      } else {
          // No filter, normal behavior
          runningBalance = systemOpeningBalance;
      }

      let rowsHtml = `
        <tr class="bg-${theme}-50 font-black italic">
          <td class="py-3 px-2 border-b" colspan="2">${this.state.filterDateStart ? `BALANCE AS OF ${this.state.filterDateStart.toLocaleDateString()}` : 'OPENING BALANCE'}</td>
          <td class="py-3 px-2 border-b text-left italic opacity-60">Balance brought forward</td>
          <td class="py-3 px-2 border-b text-right" colspan="2">---</td>
          <td class="py-3 px-2 border-b text-right">${balanceBroughtForward.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        </tr>
      `;

      const now = new Date();

      transactions.forEach(tx => {
        runningBalance += tx.amount;
        runningBalance -= tx.payment;
        
        if(tx.amount > 0) totalInvoiced += tx.amount;
        
        if (tx.payment > 0) {
            if (tx.type === 'Credit Note') totalCredits += tx.payment;
            else totalReceived += tx.payment;
        }

        // Feature: Overdue Highlighting (Specific Days)
        let overdueBadge = '';
        if (tx.type === 'Invoice' && new Date(tx.due_date) < now && (tx.raw.balance > 0 || tx.amount > 0)) { // Fallback if balance not avail
            const diffTime = Math.abs(now - new Date(tx.due_date));
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            overdueBadge = `<span class="ml-2 px-1.5 py-0.5 bg-red-100 text-red-600 text-[8px] rounded font-bold whitespace-nowrap">OVERDUE BY ${diffDays} DAYS</span>`;
        }

        let paymentDisplay = '';
        if (tx.payment !== 0) {
            if (tx.type === 'Credit Note') {
                paymentDisplay = `<span class="text-red-600 font-bold">-${tx.payment.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>`;
            } else {
                paymentDisplay = `<span class="text-emerald-600 font-bold">${tx.payment.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>`;
            }
        }

        // Feature: Summary vs Detailed Toggle
        let detailsHtml = '';
        if (!this.state.isSummaryMode) {
            if (tx.type === 'Invoice') {
              const det = this.state.invoiceDetailsCache[tx.raw.invoice_id];
              detailsHtml = `<div class="font-black text-${theme}-800 text-[10px] mb-1">INVOICE #${tx.ref} <span class="text-neutral-400 font-medium text-[8px] ml-1 whitespace-nowrap">Due: ${tx.due_date}</span>${overdueBadge}</div>`;
              if (det && det.line_items) {
                detailsHtml += `<div class="space-y-1 mt-1">`;
                det.line_items.forEach(li => {
                  const rate = parseFloat(li.rate || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
                  detailsHtml += `
                    <div class="text-[9px] border-l-2 border-${theme}-100 pl-2 mb-0.5">
                        <span class="font-bold text-neutral-800">${li.name}</span>
                        <span class="text-neutral-500 font-mono text-[8px] ml-1">
                            (${li.quantity} × ${rate})
                        </span>
                    </div>`;
                });
                detailsHtml += `</div>`;
              }
            } else if (tx.type === 'Payment Received') {
              detailsHtml = `<div class="font-bold text-emerald-700 uppercase">Payment Received</div>`;
              detailsHtml += `<div class="pl-2 opacity-80 text-[8px]">Ref: ${tx.ref}</div>`;
              if (tx.raw.invoices && tx.raw.invoices.length > 0) {
                detailsHtml += `<div class="pl-2 opacity-80 text-[8px]">Against ${tx.raw.invoices.map(i => i.invoice_number).join(', ')}</div>`;
              }
            } else if (tx.type === 'Credit Note') {
              const det = this.state.invoiceDetailsCache[tx.raw.creditnote_id];
              detailsHtml = `<div class="font-black text-red-700 text-[10px] mb-1">CREDIT NOTE #${tx.ref}</div>`;
              if (det && det.line_items) {
                 detailsHtml += `<div class="space-y-1 mt-1">`;
                det.line_items.forEach(li => {
                  const rate = parseFloat(li.rate || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
                  detailsHtml += `
                    <div class="text-[9px] border-l-2 border-red-100 pl-2 mb-0.5">
                        <span class="font-bold text-neutral-800">${li.name}</span>
                        <span class="text-neutral-600 font-mono text-[8px] ml-1">
                            (${li.quantity} × ${rate})
                        </span>
                    </div>`;
                });
                detailsHtml += `</div>`;
              }
            }
        } else {
            // Summary Mode
             if (tx.type === 'Invoice') detailsHtml = `<span class="font-bold text-${theme}-800">Invoice #${tx.ref}</span>${overdueBadge}`;
             else if (tx.type === 'Payment Received') detailsHtml = `<span class="font-bold text-emerald-700">Payment (${tx.ref})</span>`;
             else if (tx.type === 'Credit Note') detailsHtml = `<span class="font-bold text-red-700">Credit Note #${tx.ref}</span>`;
        }

        rowsHtml += `
          <tr class="border-b border-neutral-100 ledger-item-row group">
            <td class="py-3 px-2 align-top font-bold text-neutral-400 whitespace-nowrap">${tx.date}</td>
            <td class="py-3 px-2 align-top font-black text-${theme}-900 uppercase">${tx.type}</td>
            <td class="py-3 px-2 align-top text-left text-[11px] leading-tight details-cell">${detailsHtml}</td>
            <td class="py-3 px-2 align-top text-right font-bold ${tx.amount < 0 ? 'text-red-500' : 'text-neutral-800'}">
              ${tx.amount !== 0 ? Math.abs(tx.amount).toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}
            </td>
            <td class="py-3 px-2 align-top text-right">
              ${paymentDisplay}
            </td>
            <td class="py-3 px-2 align-top text-right font-black text-${theme}-900">
              ${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}
            </td>
          </tr>
        `;
      });

      // Feature: Trend Chart (Mock Data Visualization Placeholder in Header)
      const trendSvg = `<svg class="w-full h-8 opacity-50" viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M0 20 L0 10 Q 25 15 50 5 T 100 10 L 100 20 Z" fill="currentColor" /></svg>`;

      html += `
        <div class="a4-page" id="pdf-content">
          <div class="flex justify-between items-start mb-12">
            <div class="flex-grow">
              ${this.state.customLogo ? `<img src="${this.state.customLogo}" class="h-16 mb-6 object-contain">` : '<div class="h-16 w-48 bg-neutral-100 rounded mb-6 flex items-center justify-center text-[9px] text-neutral-400 border border-dashed border-neutral-300 uppercase font-black">Company Identity Logo</div>'}
              <h1 class="text-2xl font-black uppercase tracking-tighter text-${theme}-900">${projectName}</h1>
              <p class="text-[10px] text-indigo-500 font-black uppercase tracking-widest mt-1">InsightPRO Statement of Accounts (SOA)</p>
              
              <div class="mt-8">
                <p class="text-[8px] font-black uppercase text-neutral-400 mb-1 tracking-widest">Customer Details</p>
                <p class="text-xl font-black uppercase text-indigo-600">${clientName}</p>
                <p class="text-[10px] text-neutral-500 max-w-xs">${customer.email || ''}</p>
                <p class="text-[10px] text-neutral-500 max-w-xs">${customer.mobile || customer.phone || ''}</p>
              </div>
            </div>
            <div class="text-right flex-shrink-0 w-48">
              <div class="flex justify-end items-baseline gap-2">
                  <h2 class="text-4xl font-black tracking-tighter leading-none text-${theme}-600">SOA</h2>
              </div>
              <p class="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400">Ref: ${new Date().toISOString().slice(0,10).replace(/-/g,'')}</p>
              <p class="mt-1 text-[10px] font-black uppercase text-neutral-400">Date: ${new Date().toLocaleDateString()}</p>
              
              <!-- Feature: Trend Chart Visual -->
              <div class="mt-4 bg-${theme}-600 text-white p-3 rounded-xl shadow-xl overflow-hidden relative">
                <div class="relative z-10">
                    <p class="text-[8px] font-black uppercase tracking-widest opacity-80 mb-1">Current Balance Due</p>
                    <p class="text-2xl font-black uppercase tracking-tighter">${this.state.currency} ${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                </div>
                <div class="absolute bottom-0 left-0 w-full text-${theme}-800 mix-blend-multiply">
                    ${trendSvg}
                </div>
              </div>
            </div>
          </div>
          
          <table class="w-full text-left border-collapse table-fixed master-ledger-table mb-12">
            <thead>
              <tr class="bg-${theme}-600 text-white text-[9px] font-black uppercase tracking-[0.2em]">
                <th class="py-3 px-2 w-[85px]">Date</th>
                <th class="py-3 px-2 w-[90px]">Transaction</th>
                <th class="py-3 px-2 w-[240px]">Details</th>
                <th class="py-3 px-2 w-[85px] text-right">Amount</th>
                <th class="py-3 px-2 w-[85px] text-right">Payments</th>
                <th class="py-3 px-2 w-[95px] text-right">Balance</th>
              </tr>
            </thead>
            <tbody class="text-[10px] ledger-rows">
              ${rowsHtml}
            </tbody>
          </table>

          <div class="mt-auto border-t-2 border-indigo-100 pt-8 flex justify-between items-end">
            <div class="space-y-4">
              <h4 class="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Account Summary</h4>
              <div class="grid grid-cols-2 gap-x-12 gap-y-2 text-[11px] font-bold text-neutral-600 uppercase">
                <span>Opening Balance:</span><span class="text-right">${balanceBroughtForward.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span>Invoiced Amount:</span><span class="text-right">${totalInvoiced.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span>Amount Received:</span><span class="text-right text-emerald-600">${totalReceived.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span>Credit Notes:</span><span class="text-right text-red-600">${totalCredits.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span class="pt-2 border-t font-black text-indigo-900 text-sm">Balance Due:</span>
                <span class="pt-2 border-t font-black text-indigo-900 text-sm text-right">${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>
            <div class="text-right">
              <p class="text-[11px] font-black uppercase text-indigo-500 italic">Official Account Statement</p>
              <div class="mt-6 h-12 w-48 border-b-2 border-indigo-200 ml-auto"></div>
              <p class="mt-2 text-[8px] font-black uppercase tracking-widest text-neutral-400">Authorized Signatory</p>
            </div>
          </div>
        </div>`;
    });

    this.targets.renderArea.innerHTML = html;
    
    // Save notes on change
    const notesDiv = document.getElementById('editable-notes');
    if(notesDiv) {
        notesDiv.oninput = (e) => {
            this.state.notesContent = e.target.innerHTML;
            localStorage.setItem('biz_notes', this.state.notesContent);
        };
    }

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
    
    if (this.state.selectedCustomerIds.size === 0) {
      alert("No customer selected.");
      this.hideLoading();
      return;
    }

    const data = [];
    const projectName = this.inputs.orgSelect.options[this.inputs.orgSelect.selectedIndex]?.text || 'N/A';

    this.state.selectedCustomerIds.forEach(id => {
      const customer = this.state.customerFullDetails[id] || {};
      const clientName = customer.contact_name || 'N/A';
      
      const openingBalance = parseFloat(customer.opening_balance) || 0;
      let runningBalance = openingBalance;
      
      data.push({
        'Date': '---',
        'Transaction': 'OPENING BALANCE',
        'Reference': '---',
        'Details': 'Balance Brought Forward',
        'Amount (Debit)': 0,
        'Payment/Credit': 0,
        'Balance': openingBalance,
        'Customer': clientName
      });

      let transactions = [];
      
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

      (this.state.dataStore.creditnotes[id]?.records || []).forEach(cn => {
        transactions.push({
          date: cn.date,
          type: 'Credit Note',
          ref: cn.creditnote_number,
          amount: 0, 
          payment: parseFloat(cn.total) || 0, 
          raw: cn,
          sortDate: new Date(cn.date),
          isCredit: true
        });
      });

      transactions.sort((a,b) => a.sortDate - b.sortDate);

      transactions.forEach(tx => {
        runningBalance += tx.amount;
        runningBalance -= tx.payment;

        let detailStr = '';
        if (tx.type === 'Invoice' || tx.type === 'Credit Note') {
           const cacheKey = tx.type === 'Invoice' ? tx.raw.invoice_id : tx.raw.creditnote_id;
           const det = this.state.invoiceDetailsCache[cacheKey];
           if (det && det.line_items) {
             detailStr = det.line_items.map(li => `${li.name} (${li.quantity} x ${li.rate})`).join('; ');
           }
        } else if (tx.type === 'Payment Received') {
           detailStr = `Ref: ${tx.ref}`;
        }

        let debit = tx.amount;
        let credit = tx.payment;
        
        data.push({
          'Date': tx.date,
          'Transaction': tx.type,
          'Reference': tx.ref,
          'Details': detailStr,
          'Amount (Debit)': debit !== 0 ? debit : '',
          'Payment/Credit': credit !== 0 ? (tx.isCredit ? -credit : credit) : '', 
          'Balance': runningBalance,
          'Customer': clientName
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SOA_Detailed");
    XLSX.writeFile(wb, `SOA_${projectName.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
    this.hideLoading();
  }

  printReport() {
      // The @media print CSS in index.html handles the visibility of elements.
      // We just need to trigger the browser's print dialog.
      window.print();
  }

  downloadPDF() {
    this.showLoading(85, "Rendering High-Def PDF...");
    
    // Select the Rendered Page
    const element = this.targets.renderArea.querySelector('.a4-page');
    
    if (!element) {
        alert("No statement generated to export.");
        this.hideLoading();
        return;
    }

    // 1. SAVE ORIGINAL STYLES
    const originalTransform = element.style.transform;
    const originalMargin = element.style.margin;
    const originalPosition = element.style.position;
    const originalLeft = element.style.left;
    const originalTop = element.style.top;
    
    // 2. FORCE PDF LAYOUT
    // We position it ABSOLUTELY at 0,0 to ensure HTML2Canvas sees the whole thing
    // without the sidebar pushing it.
    element.style.transform = 'scale(1)'; 
    element.style.margin = '0'; 
    element.style.width = '210mm'; 
    element.style.maxWidth = '210mm';
    element.style.position = 'fixed';
    element.style.left = '0';
    element.style.top = '0';
    element.style.zIndex = '9999'; // Ensure it's on top of everything
    
    const opt = {
      margin: 0, 
      filename: `SOA_${new Date().toISOString().slice(0,10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        scrollY: 0,
        scrollX: 0,
        x: 0, // CRITICAL FIX: Force capture start X
        y: 0, // CRITICAL FIX: Force capture start Y
        logging: false,
        width: 794, // Approx 210mm in px at 96 DPI
        windowWidth: 794
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      // 3. RESTORE ORIGINAL STYLES
      element.style.transform = originalTransform;
      element.style.margin = originalMargin;
      element.style.width = '210mm';
      element.style.position = originalPosition;
      element.style.left = originalLeft;
      element.style.top = originalTop;
      element.style.zIndex = '';
      
      this.hideLoading();
    }).catch(err => {
      console.error("PDF Gen Error", err);
      alert("PDF Generation Failed: " + err.message);
      
      // Restore on error too
      element.style.transform = originalTransform;
      element.style.margin = originalMargin;
      element.style.position = originalPosition;
      
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
    const loadingContainer = this.views.loadingContainer || document.getElementById('loading-container');
    const loadingProgress = this.views.loadingProgress || document.getElementById('loading-progress');
    const loadingText = this.views.loadingText || document.getElementById('loading-text');

    if(loadingContainer) loadingContainer.classList.remove('view-hidden');
    if(loadingProgress) loadingProgress.style.width = `${prog}%`;
    if(loadingText) loadingText.innerText = txt.toUpperCase();
    
    // Feature: Skeleton Loading
    if(this.views.skeletonLoader) this.views.skeletonLoader.classList.remove('view-hidden');
    if(this.views.statementContainer) this.views.statementContainer.classList.add('view-hidden');
  }

  hideLoading() {
    const loadingProgress = this.views.loadingProgress || document.getElementById('loading-progress');
    if(loadingProgress) loadingProgress.style.width = '100%';
    
    setTimeout(() => {
      const loadingContainer = this.views.loadingContainer || document.getElementById('loading-container');
      if(loadingContainer) loadingContainer.classList.add('view-hidden');
      
      // Feature: Skeleton Loading
      if(this.views.skeletonLoader) this.views.skeletonLoader.classList.add('view-hidden');
      if(this.views.statementContainer) this.views.statementContainer.classList.remove('view-hidden');
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