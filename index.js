/**
 * BIZSENSE PRO — Statement Engine
 * Zoho Books · Ledger SOA + Sales Statement Builder
 */

class BizSensePro {
  constructor() {
    this.initConfig();
    this.state = {
      accessToken: localStorage.getItem('zoho_access_token'),
      organizations: [],
      selectedOrgId: localStorage.getItem('zoho_selected_org_id'),
      currentOrgDetails: null,
      customers: [],
      customerFullDetails: {},
      selectedCustomerIds: new Set(),
      activeModules: new Set(
        JSON.parse(localStorage.getItem('active_modules') || '["invoices","creditnotes","customerpayments"]')
      ),
      dataStore: { invoices: {}, creditnotes: {}, payments: {}, estimates: {}, salesorders: {} },
      invoiceDetailsCache: {},
      itemGroupCache: {},
      customLogo: localStorage.getItem('biz_logo') || null,
      zoom: 0.8,
      activeView: 'ledger',
      explorerModule: 'invoices',
      currency: localStorage.getItem('biz_currency') || 'LKR',
      theme: localStorage.getItem('biz_theme') || 'blue',
      isSummaryMode: false,
      filterDateStart: null,
      filterDateEnd: null,
      tableBorders: false,
      priceOverrides: {},
      companyExtras: JSON.parse(localStorage.getItem('biz_company_extras') || JSON.stringify({
        address: '', phone: '', email: '', website: '', reg: ''
      })),
      notesContent: localStorage.getItem('biz_notes') || 'Please ensure payment is made by the due date. Thank you for your business.',
      stampMode: localStorage.getItem('biz_stamp') || 'none', // 'none' | 'draft' | 'final'
      stampConfig: JSON.parse(localStorage.getItem('biz_stamp_config') || JSON.stringify({
        draftColor: '#dc2626',
        finalColor: '#059669',
        stampSize: '88px',
        stampOpacity: '0.18',
        stampRotation: '-32deg',
        stampBorderWidth: '5px',
        stampFontSize: '52px',
        stampPosition: 'center', // 'center' | 'top-right' | 'bottom-right'
      })),
      termsContent: localStorage.getItem('biz_terms') || '1. Prices shown are system prices for accounting reference only.\n2. Any special or discounted rates are applicable only upon settlement within the mutually agreed credit period. Discounts will be applied at the time of settlement, and payments received beyond the agreed timeline will be settled at the standard system price applicable for the relevant period.',
      termsConfig: JSON.parse(localStorage.getItem('biz_terms_config') || JSON.stringify({
        fontSize: '8px',
        titleFontSize: '9px',
        color: '#64748b',
        borderColor: '#e2e8f0',
        bgColor: '#f8fafc',
        showTitle: true,
        titleText: 'Terms & Conditions',
        showOnFinal: true,
        showOnDraft: false,
      })),
      termsDraftContent: localStorage.getItem('biz_terms_draft') || '1. Prices shown are system prices for accounting reference only.\n2. Any special or discounted rates are applicable only upon settlement within the mutually agreed credit period. Discounts will be applied at the time of settlement, and payments received beyond the agreed timeline will be settled at the standard system price applicable for the relevant period.',
      termsDraftConfig: JSON.parse(localStorage.getItem('biz_terms_draft_config') || JSON.stringify({
        fontSize: '8px',
        titleFontSize: '9px',
        color: '#64748b',
        borderColor: '#e2e8f0',
        bgColor: '#f8fafc',
        showTitle: true,
        titleText: 'Terms & Conditions',
      })),
      searchField: localStorage.getItem('biz_search_field') || 'name', // 'name' | 'id' | 'phone'
      datePriceRules: JSON.parse(localStorage.getItem('biz_date_price_rules') || '[]'),
      // Each rule: { id, itemName, fromDate, toDate, price }
      activePriceSession: null, // { fromDate, toDate, items: Map }
      builderConfig: JSON.parse(localStorage.getItem('builder_config') || JSON.stringify({
        showHeader: true,
        showCustomer: true,
        showOpening: true,
        showPayments: true,
        showCredits: true,
        showSummary: true,
        showNotes: true,
        formulaOverdue: true,
      })),
      colors: [
        { name: 'blue',    primary: '#1d4ed8', accent: '#3b82f6', light: '#eff6ff' },
        { name: 'indigo',  primary: '#4338ca', accent: '#6366f1', light: '#eef2ff' },
        { name: 'violet',  primary: '#6d28d9', accent: '#8b5cf6', light: '#f5f3ff' },
        { name: 'rose',    primary: '#be123c', accent: '#f43f5e', light: '#fff1f2' },
        { name: 'emerald', primary: '#065f46', accent: '#059669', light: '#ecfdf5' },
        { name: 'amber',   primary: '#b45309', accent: '#f59e0b', light: '#fffbeb' },
        { name: 'slate',   primary: '#334155', accent: '#64748b', light: '#f8fafc' },
        { name: 'cyan',    primary: '#0e7490', accent: '#06b6d4', light: '#ecfeff' },
      ],
      quotes: [
        '"Revenue is vanity, profit is sanity, but cash is king."',
        '"Opportunities don\'t happen. You create them."',
        '"The best way to predict the future is to create it."',
        '"Quality means doing it right when no one is looking."',
        '"Success usually comes to those too busy to be looking for it."',
        '"Don\'t count the days, make the days count."',
      ],
    };

    this.handleOAuthCallback();
    this.init();
  }

  // ─────────────────────────────────────────
  // CONFIG (proxy URL configurable)
  // ─────────────────────────────────────────
  initConfig() {
    const saved = localStorage.getItem('zoho_config');
    this.config = saved ? JSON.parse(saved) : {
      clientId: '',
      region: 'com',
    };
  }

  get proxyPrefix() {
    return 'https://lahirusehan-proxy.onrender.com/';
  }

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────
  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.cacheDOM();
      this.bindEvents();
      this.renderColorPicker();
      this.updateConfigStatus();
      this.checkSession();
      this.initLandingUI();
      this.applyBuilderConfigToUI();
      setTimeout(() => this.autoFitZoom(), 800);
      window.addEventListener('resize', () => this.autoFitZoom());
    });
  }

  initLandingUI() {
    // Background slideshow
    const bg = document.getElementById('bg-slideshow');
    if (bg) {
      const imgs = [
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=2032&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=2011&auto=format&fit=crop',
      ];
      bg.innerHTML = imgs.map((url, i) =>
        `<div class="bg-slide${i === 0 ? ' active' : ''}" style="background-image:url(${url})"></div>`
      ).join('');
      let cur = 0;
      setInterval(() => {
        const slides = bg.querySelectorAll('.bg-slide');
        slides[cur].classList.remove('active');
        cur = (cur + 1) % slides.length;
        slides[cur].classList.add('active');
      }, 4500);
    }

    // Rotating quotes
    const qEl = document.getElementById('business-quote');
    if (qEl) {
      let qi = 0;
      setInterval(() => {
        qi = (qi + 1) % this.state.quotes.length;
        qEl.style.opacity = '0';
        setTimeout(() => { qEl.textContent = this.state.quotes[qi]; qEl.style.opacity = '1'; }, 500);
      }, 5000);
    }

    // Auto-populate redirect URI
    const redirectUri = window.location.origin + window.location.pathname;
    const disp = document.getElementById('display-redirect-uri');
    if (disp) disp.textContent = redirectUri;

    // Prefill saved config values
    const clientIdEl = document.getElementById('cfg-client-id');
    const regionEl = document.getElementById('cfg-region');
    if (clientIdEl) {
      clientIdEl.value = this.config.clientId || '';
      // Re-evaluate button state live as user types
      clientIdEl.addEventListener('input', () => this.updateConfigStatus());
    }
    if (regionEl) regionEl.value = this.config.region || 'com';

    // Check button state based on what's already saved
    this.updateConfigStatus();
  }

  cacheDOM() {
    this.views = {
      landing: document.getElementById('view-landing'),
      dashboard: document.getElementById('view-dashboard'),
      settingsModal: document.getElementById('modal-settings'),
      emailModal: document.getElementById('modal-email'),
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
      emptyState: document.getElementById('empty-state'),
      builderPanel: document.getElementById('builder-panel'),
      priceEditorPanel: document.getElementById('price-editor-panel'),
      priceEditorList: document.getElementById('price-editor-list'),
    };
    this.inputs = {
      orgSelect: document.getElementById('select-organization'),
      search: document.getElementById('customer-search'),
      logoUpload: document.getElementById('logo-upload'),
      dateRangePreset: document.getElementById('date-range-preset'),
      dateStart: document.getElementById('date-start'),
      dateEnd: document.getElementById('date-end'),
      toggleSummary: document.getElementById('toggle-summary'),
      moduleCheckboxes: document.querySelectorAll('#module-selector input'),
      moduleCards: document.querySelectorAll('.module-card'),
      // Builder
      blHeader: document.getElementById('bl-header'),
      blCustomer: document.getElementById('bl-customer'),
      blOpening: document.getElementById('bl-opening'),
      blPayments: document.getElementById('bl-payments'),
      blCredits: document.getElementById('bl-credits'),
      blSummary: document.getElementById('bl-summary'),
      blNotes: document.getElementById('bl-notes'),
      formulaOverdue: document.getElementById('formula-overdue'),
    };
    this.btns = {
      connect: document.getElementById('btn-connect'),
      saveConfig: document.getElementById('btn-save-config'),
      print: document.getElementById('btn-print'),
      downloadPdf: document.getElementById('btn-download-pdf'),
      downloadImage: document.getElementById('btn-download-image'),
      downloadExcel: document.getElementById('btn-download-excel'),
      emailComposer: document.getElementById('btn-email-composer'),
      logout: document.getElementById('btn-logout'),
      clearAll: document.getElementById('btn-clear-all'),
      openSettings: document.getElementById('btn-project-settings'),
      closeSettings: document.getElementById('btn-close-settings'),
      applySettings: document.getElementById('btn-apply-settings'),
      zoomIn: document.getElementById('btn-zoom-in'),
      zoomOut: document.getElementById('btn-zoom-out'),
      zoomFit: document.getElementById('btn-zoom-fit'),
      toggleLedger: document.getElementById('btn-view-ledger'),
      toggleExplorer: document.getElementById('btn-view-explorer'),
      toggleBuilder: document.getElementById('btn-toggle-builder'),
      builderApply: document.getElementById('btn-builder-apply'),
      closeEmail: document.getElementById('btn-close-email'),
      copyEmail: document.getElementById('btn-copy-email'),
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
      colorPicker: document.getElementById('color-theme-picker'),
    };
  }

  bindEvents() {
    if (this.btns.connect) this.btns.connect.onclick = () => this.startAuth();
    if (this.btns.saveConfig) this.btns.saveConfig.onclick = () => this.saveConfig();
    if (this.btns.logout) this.btns.logout.onclick = () => this.logout();
    if (this.btns.print) this.btns.print.onclick = () => window.print();
    if (this.btns.downloadPdf) this.btns.downloadPdf.onclick = () => this.downloadPDF();
    if (this.btns.downloadExcel) this.btns.downloadExcel.onclick = () => this.downloadExcel();
    if (this.btns.emailComposer) this.btns.emailComposer.onclick = () => this.openEmailComposer();
    if (this.btns.closeEmail) this.btns.closeEmail.onclick = () => this.views.emailModal.classList.add('view-hidden');
    if (this.btns.copyEmail) this.btns.copyEmail.onclick = () => this.copyEmailToClipboard();
    if (this.btns.clearAll) this.btns.clearAll.onclick = () => this.clearAllCustomers();
    if (this.btns.openSettings) this.btns.openSettings.onclick = () => this.views.settingsModal.classList.remove('view-hidden');
    if (this.btns.toggleBuilder) this.btns.toggleBuilder.addEventListener('click', () => {
      setTimeout(() => {
        this.renderPriceEditor();
        this._populateBuilderStampTCFields();
      }, 50);
    }, true);
    if (this.btns.closeSettings) this.btns.closeSettings.onclick = () => this.views.settingsModal.classList.add('view-hidden');
    if (this.btns.applySettings) this.btns.applySettings.onclick = () => this.applySettings();
    if (this.btns.zoomIn) this.btns.zoomIn.onclick = () => this.setZoom(this.state.zoom + 0.1);
    if (this.btns.zoomOut) this.btns.zoomOut.onclick = () => this.setZoom(this.state.zoom - 0.1);
    if (this.btns.zoomFit) this.btns.zoomFit.onclick = () => this.autoFitZoom();
    if (this.btns.toggleLedger) this.btns.toggleLedger.onclick = () => this.switchView('ledger');
    if (this.btns.toggleExplorer) this.btns.toggleExplorer.onclick = () => this.switchView('explorer');
    if (this.btns.toggleBuilder) this.btns.toggleBuilder.onclick = () => this.toggleBuilderPanel();
    if (this.btns.builderApply) this.btns.builderApply.onclick = () => this.applyBuilderAndRender();

    const resetPrices = document.getElementById('btn-reset-prices');
    if (resetPrices) resetPrices.onclick = () => this.resetAllPrices();

    const borderToggle = document.getElementById('toggle-borders');
    if (borderToggle) borderToggle.onchange = () => {
      this.state.tableBorders = borderToggle.checked;
      this.renderStatementUI();
    };

    if (this.inputs.search) this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
    if (this.inputs.logoUpload) this.inputs.logoUpload.onchange = (e) => this.handleLogoUpload(e);
    if (this.inputs.orgSelect) this.inputs.orgSelect.onchange = (e) => this.handleOrgSwitch(e.target.value);
    if (this.inputs.dateRangePreset) this.inputs.dateRangePreset.onchange = (e) => this.handleDatePreset(e.target.value);
    if (this.inputs.dateStart) this.inputs.dateStart.onchange = () => this.updateDateFilter();
    if (this.inputs.dateEnd) this.inputs.dateEnd.onchange = () => this.updateDateFilter();
    // Stamp mode radio buttons
    document.querySelectorAll('input[name="stamp-mode"]').forEach(r => {
      r.onchange = () => {
        this.state.stampMode = r.value;
        localStorage.setItem('biz_stamp', r.value);
        this.renderStatementUI();
      };
    });

    // Search field selector
    const searchFieldBtns = document.querySelectorAll('.search-field-btn');
    searchFieldBtns.forEach(btn => {
      btn.onclick = () => {
        this.state.searchField = btn.dataset.field;
        localStorage.setItem('biz_search_field', btn.dataset.field);
        searchFieldBtns.forEach(b => {
          const isActive = b === btn;
          b.style.background = isActive ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)';
          b.style.color = isActive ? '#93c5fd' : 'rgba(255,255,255,0.3)';
        });
        if (this.inputs.search) this.inputs.search.value = '';
        this.filterCustomers('');
        const ph = { name: 'Search by name…', id: 'Search by customer ID…', phone: 'Search by phone…' };
        if (this.inputs.search) this.inputs.search.placeholder = ph[this.state.searchField] || 'Search…';
      };
    });

    if (this.inputs.toggleSummary) this.inputs.toggleSummary.onchange = () => {
      this.state.isSummaryMode = this.inputs.toggleSummary.checked;
      this.renderStatementUI();
    };

    // Module card toggle visual
    this.inputs.moduleCards.forEach(card => {
      const cb = card.querySelector('input[type="checkbox"]');
      if (cb) {
        cb.onchange = () => card.classList.toggle('checked', cb.checked);
      }
    });

    // Opening balance override
    const obApply = document.getElementById('ob-override-apply');
    const obClear = document.getElementById('ob-override-clear');
    if (obApply) obApply.onclick = () => this.applyOpeningBalanceOverride();
    if (obClear) obClear.onclick = () => this.clearOpeningBalanceOverride();
    const obInput = document.getElementById('ob-override-input');
    if (obInput) obInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.applyOpeningBalanceOverride(); });

    // Keyboard nav
    document.addEventListener('keydown', (e) => {
      if (this.state.activeView !== 'ledger' || !this.state.customers.length) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const currentId = Array.from(this.state.selectedCustomerIds)[0];
      let idx = this.state.customers.findIndex(c => c.contact_id === currentId);
      if (e.key === 'ArrowDown') idx = idx < this.state.customers.length - 1 ? idx + 1 : 0;
      if (e.key === 'ArrowUp') idx = idx > 0 ? idx - 1 : this.state.customers.length - 1;
      const next = this.state.customers[idx];
      if (next) this.handleCustomerClick(next.contact_id);
    });
  }

  // ─────────────────────────────────────────
  // OPENING BALANCE OVERRIDE HELPERS
  // ─────────────────────────────────────────
  _getObOverrideKey(id) {
    return `ob_override_${id}`;
  }

  applyOpeningBalanceOverride() {
    const id = Array.from(this.state.selectedCustomerIds)[0];
    if (!id) { alert('Please select a customer first.'); return; }
    const input = document.getElementById('ob-override-input');
    const val = parseFloat(input?.value);
    if (isNaN(val)) { alert('Please enter a valid number.'); return; }
    localStorage.setItem(this._getObOverrideKey(id), val.toString());
    this.log(`Opening balance override set: ${val}`);
    this.updateObOverrideInputVisual(id);
    this.renderStatementUI();
  }

  clearOpeningBalanceOverride() {
    const id = Array.from(this.state.selectedCustomerIds)[0];
    if (!id) return;
    localStorage.removeItem(this._getObOverrideKey(id));
    const input = document.getElementById('ob-override-input');
    if (input) input.value = '';
    this.updateObOverrideInputVisual(id);
    this.log('Opening balance override cleared — using Zoho value');
    this.renderStatementUI();
  }

  updateObOverrideInputVisual(id) {
    const input = document.getElementById('ob-override-input');
    const applyBtn = document.getElementById('ob-override-apply');
    if (!input) return;
    const stored = id ? localStorage.getItem(this._getObOverrideKey(id)) : null;
    if (stored !== null) {
      input.value = stored;
      if (applyBtn) applyBtn.style.background = '#059669';
    } else {
      const customer = this.state.customerFullDetails[id] || {};
      const zohoVal = customer._computed_opening_balance || 0;
      input.value = '';
      input.placeholder = `Zoho: ${zohoVal.toLocaleString(undefined, {minimumFractionDigits:2})}`;
      if (applyBtn) applyBtn.style.background = '';
    }
  }

  getEffectiveOpeningBalance(id) {
    const stored = localStorage.getItem(this._getObOverrideKey(id));
    if (stored !== null) return parseFloat(stored) || 0;
    const customer = this.state.customerFullDetails[id] || {};
    return (customer._computed_opening_balance ?? parseFloat(customer.opening_balance)) || 0;
  }

  // ─────────────────────────────────────────
  // CONFIG & AUTH
  // ─────────────────────────────────────────
  saveConfig() {
    const clientId = (document.getElementById('cfg-client-id')?.value || '').trim();
    const region = document.getElementById('cfg-region')?.value || 'com';
    this.config = { clientId, region };
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.updateConfigStatus();
    this.log('Config saved');
  }

  updateConfigStatus() {
    const liveInput = document.getElementById('cfg-client-id');
    const val = (liveInput?.value || this.config.clientId || '').trim();
    if (this.btns.connect) this.btns.connect.disabled = val.length < 5;
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

  startAuth() {
    if (!this.config.clientId || this.config.clientId.length < 3) {
      this.showLandingError('Client ID is required. Please save your configuration first.');
      return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = 'ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.estimates.READ,ZohoBooks.salesorders.READ,ZohoBooks.creditnotes.READ,ZohoBooks.customerpayments.READ,ZohoBooks.settings.READ,ZohoBooks.items.READ';
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent`;
    window.location.href = authUrl;
  }

  async checkSession() {
    if (!this.state.accessToken) return;
    this.showLoading(20, 'Connecting…');
    try {
      const ok = await this.discoverOrganizations();
      if (ok) {
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

  logout(reload = true) {
    localStorage.removeItem('zoho_access_token');
    if (reload) window.location.reload();
  }

  // ─────────────────────────────────────────
  // API
  // ─────────────────────────────────────────
  async rawRequest(url) {
    const res = await fetch(this.proxyPrefix + url, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (res.status === 401) throw new Error('Session Expired — please reconnect');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.message || 'API request failed');
    }
    const data = await res.json();
    return data;
  }

  async discoverOrganizations() {
    const res = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/organizations`);
    if (res && res.organizations && res.organizations.length) {
      this.state.organizations = res.organizations;
      const sel = this.inputs.orgSelect;
      if (sel) {
        sel.innerHTML = '';
        res.organizations.forEach(org => {
          const opt = document.createElement('option');
          opt.value = org.organization_id;
          opt.textContent = org.name;
          sel.appendChild(opt);
        });
        if (!this.state.selectedOrgId) this.state.selectedOrgId = res.organizations[0].organization_id;
        sel.value = this.state.selectedOrgId;
      }
      return true;
    }
    throw new Error('No organizations returned. Session may have expired.');
  }

  async fetchOrganizationDetails() {
    try {
      const res = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/settings/organization?organization_id=${this.state.selectedOrgId}`);
      if (res && res.organization) this.state.currentOrgDetails = res.organization;
    } catch (e) { console.warn('Org details fetch failed', e); }
  }

  async fetchCustomers() {
    this.showLoading(40, 'Loading customers…');
    try {
      let allContacts = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await this.rawRequest(
          `https://www.zohoapis.${this.config.region}/books/v3/contacts?contact_type=customer&status=active&organization_id=${this.state.selectedOrgId}&page=${page}&per_page=200`
        );
        if (res && res.contacts && res.contacts.length > 0) {
          allContacts = allContacts.concat(res.contacts);
          hasMore = res.page_context?.has_more_page === true;
          page++;
          this.showLoading(40, `Loading customers… (${allContacts.length})`);
        } else {
          hasMore = false;
        }
      }
      this.state.customers = allContacts;
      this.renderCustomerList();
      this.log(`${allContacts.length} customers loaded`);
    } catch (e) { this.log(`Error: ${e.message}`); }
    finally { this.hideLoading(); }
  }

  async syncCustomerData(id) {
    const customer = this.state.customers.find(c => c.contact_id === id);
    if (!customer) return;
    this.showLoading(50, `Loading: ${customer.contact_name}`);

    // Fetch full contact
    try {
      const cRes = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/contacts/${id}?organization_id=${this.state.selectedOrgId}`);
      this.state.customerFullDetails[id] = cRes.contact;
      const c = cRes.contact;
      this.state.currency = c.currency_symbol || c.currency_code || 'LKR';
      localStorage.setItem('biz_currency', this.state.currency);

      // Zoho returns opening_balance_amount on the contact record
      const ob = parseFloat(c.opening_balance_amount || c.opening_balance || 0) || 0;
      this.state.customerFullDetails[id]._computed_opening_balance = ob;
    } catch (e) { console.warn('Contact detail fetch failed', e); }

    // Sync modules
    const modulesToSync = ['invoices', 'creditnotes', 'customerpayments'];
    if (this.state.activeModules.has('estimates')) modulesToSync.push('estimates');
    if (this.state.activeModules.has('salesorders')) modulesToSync.push('salesorders');

    for (const mod of modulesToSync) {
      try {
        const url = `https://www.zohoapis.${this.config.region}/books/v3/${mod}?customer_id=${id}&organization_id=${this.state.selectedOrgId}`;
        const res = await this.rawRequest(url);
        const storageKey = mod === 'customerpayments' ? 'payments' : mod;
        if (!this.state.dataStore[storageKey]) this.state.dataStore[storageKey] = {};
        this.state.dataStore[storageKey][id] = { customerName: customer.contact_name, records: res[mod] || [] };

        // Fetch detail records for invoices, creditnotes, estimates, salesorders
        if (['invoices', 'creditnotes', 'estimates', 'salesorders'].includes(mod)) {
          const idKey = {
            invoices: 'invoice_id',
            creditnotes: 'creditnote_id',
            estimates: 'estimate_id',
            salesorders: 'salesorder_id',
          }[mod];
          for (const rec of this.state.dataStore[storageKey][id].records) {
            const rid = rec[idKey];
            if (rid && !this.state.invoiceDetailsCache[rid]) {
              try {
                const singularMod = mod === 'creditnotes' ? 'creditnote' : mod.slice(0, -1);
                const dRes = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/${mod}/${rid}?organization_id=${this.state.selectedOrgId}`);
                this.state.invoiceDetailsCache[rid] = dRes[singularMod] || dRes[mod.slice(0,-1)] || dRes;
              } catch (e) { console.warn(`Detail fetch failed for ${mod}/${rid}`, e); }
            }
          }
        }
      } catch (e) { console.error(`Module ${mod} sync failed`, e); }
    }

    this.hideLoading();
  }

  // ─────────────────────────────────────────
  // CUSTOMER LIST
  // ─────────────────────────────────────────
  renderCustomerList() {
    if (!this.views.customerList) return;
    this.views.customerList.innerHTML = '';
    const sorted = [...this.state.customers].sort((a, b) => a.contact_name.localeCompare(b.contact_name));

    sorted.forEach(c => {
      const isSelected = this.state.selectedCustomerIds.has(c.contact_id);
      const balance = parseFloat(c.outstanding_receivable_amount || 0);
      const credits = parseFloat(c.unused_credits_receivable_amount || 0);

      let badgeHtml = '';
      if (balance > 0) {
        badgeHtml = `<span class="cust-badge badge-due">DUE ${this.state.currency} ${balance.toLocaleString()}</span>`;
      } else if (credits > 0) {
        badgeHtml = `<span class="cust-badge badge-credit">CR ${credits.toLocaleString()}</span>`;
      } else {
        badgeHtml = `<span class="cust-badge badge-ok">CLEARED</span>`;
      }

      const div = document.createElement('div');
      div.className = `cust-item${isSelected ? ' selected' : ''}`;
      div.innerHTML = `
        <div class="cust-checkbox">${isSelected ? '<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</div>
        <div style="flex:1;min-width:0;">
          <div class="cust-name">${c.contact_name}</div>
          ${badgeHtml}
        </div>
      `;
      div.dataset.custId = c.contact_id;
      div.onclick = () => this.handleCustomerClick(c.contact_id);
      this.views.customerList.appendChild(div);
    });
  }

  async handleCustomerClick(id) {
    if (this.state.selectedCustomerIds.has(id)) {
      this.state.selectedCustomerIds.delete(id);
      this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {}, estimates: {}, salesorders: {} };
      this.state.priceOverrides = {};
      this.state.activePriceSession = null;
      this.updateObOverrideInputVisual(null);
      if (this.views.priceEditorPanel) this.views.priceEditorPanel.style.display = 'none';
    } else {
      this.state.selectedCustomerIds.clear();
      this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {}, estimates: {}, salesorders: {} };
      this.state.priceOverrides = {};
      this.state.selectedCustomerIds.add(id);
      await this.syncCustomerData(id);
      this.updateObOverrideInputVisual(id);
      if (this.views.priceEditorPanel) this.views.priceEditorPanel.style.display = 'flex';
      this.renderPriceEditor();
      this.renderPriceEditor();
    }
    this.renderCustomerList();
    this.updateUIVisuals();
  }

  clearAllCustomers() {
    this.state.selectedCustomerIds.clear();
    this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {}, estimates: {}, salesorders: {} };
    this.state.priceOverrides = {};
    if (this.views.priceEditorPanel) this.views.priceEditorPanel.style.display = 'none';
    this.renderCustomerList();
    this.updateUIVisuals();
  }

  filterCustomers(term) {
    const field = this.state.searchField || 'name';
    const t = term.toLowerCase();
    const visible = this.state.customers.filter(c => {
      if (!t) return true;
      if (field === 'name') return (c.contact_name || '').toLowerCase().includes(t);
      if (field === 'id') return (c.contact_id || '').toLowerCase().includes(t) || (c.cf_customer_id || '').toLowerCase().includes(t);
      if (field === 'phone') return (c.mobile || c.phone || c.phone_mobile_formatted || '').toLowerCase().includes(t);
      return (c.contact_name || '').toLowerCase().includes(t);
    }).map(c => c.contact_id);
    this.views.customerList?.querySelectorAll('.cust-item').forEach(item => {
      const id = item.dataset.custId;
      item.style.display = visible.includes(id) ? '' : 'none';
    });
  }

  // ─────────────────────────────────────────
  // VIEW SWITCHING
  // ─────────────────────────────────────────
  switchView(view) {
    this.state.activeView = view;
    this.views.ledgerView.classList.toggle('view-hidden', view !== 'ledger');
    this.views.explorerView.classList.toggle('view-hidden', view !== 'explorer');

    if (this.views.ledgerView) this.views.ledgerView.style.display = view === 'ledger' ? 'flex' : 'none';
    if (this.views.explorerView) this.views.explorerView.style.display = view === 'explorer' ? 'flex' : 'none';

    if (this.btns.toggleLedger) this.btns.toggleLedger.classList.toggle('active', view === 'ledger');
    if (this.btns.toggleExplorer) this.btns.toggleExplorer.classList.toggle('active', view === 'explorer');

    if (view === 'explorer') this.renderExplorer();
    else this.autoFitZoom();
  }


  toggleBuilderPanel() {
    const panel = this.views.builderPanel;
    if (!panel) return;
    const isHidden = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = isHidden ? 'flex' : 'none';
  }

  // ─────────────────────────────────────────
  // BUILDER CONFIG
  // ─────────────────────────────────────────
  _populateBuilderStampTCFields() {
    const sc = this.state.stampConfig;
    const tc = this.state.termsConfig;
    const tdc = this.state.termsDraftConfig;
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const setC = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
    setV('stamp-draft-color', sc.draftColor);
    setV('stamp-final-color', sc.finalColor);
    setV('stamp-font-size', sc.stampFontSize);
    setV('stamp-position', sc.stampPosition);
    setV('stamp-rotation', sc.stampRotation);
    setV('stamp-opacity', sc.stampOpacity);
    setV('stamp-border-width', sc.stampBorderWidth);
    // Final Bill T&C
    setC('tc-show-final', tc.showOnFinal !== false);
    setC('tc-show-title', tc.showTitle);
    setV('tc-title-text', tc.titleText);
    setV('tc-color', tc.color);
    setV('tc-bg-color', tc.bgColor);
    setV('tc-border-color', tc.borderColor);
    setV('tc-font-size', tc.fontSize);
    const tcEl = document.getElementById('tc-content');
    if (tcEl) tcEl.value = this.state.termsContent || '';
    // Draft Bill T&C
    setC('tc-show-draft', tc.showOnDraft === true);
    setC('tc-show-title-draft', tdc.showTitle);
    setV('tc-title-text-draft', tdc.titleText);
    setV('tc-color-draft', tdc.color);
    setV('tc-bg-color-draft', tdc.bgColor);
    setV('tc-border-color-draft', tdc.borderColor);
    setV('tc-font-size-draft', tdc.fontSize);
    const tcDraftEl = document.getElementById('tc-content-draft');
    if (tcDraftEl) tcDraftEl.value = this.state.termsDraftContent || '';
    // Show/hide draft TC settings panel based on toggle
    const draftSettings = document.getElementById('draft-tc-settings');
    if (draftSettings) draftSettings.style.display = tc.showOnDraft ? 'block' : 'none';
    const finalSettings = document.getElementById('final-tc-settings');
    if (finalSettings) finalSettings.style.display = tc.showOnFinal !== false ? 'block' : 'none';
    // Wire toggle show/hide
    const draftToggle = document.getElementById('tc-show-draft');
    if (draftToggle) draftToggle.onchange = () => {
      if (draftSettings) draftSettings.style.display = draftToggle.checked ? 'block' : 'none';
    };
    const finalToggle = document.getElementById('tc-show-final');
    if (finalToggle) finalToggle.onchange = () => {
      if (finalSettings) finalSettings.style.display = finalToggle.checked ? 'block' : 'none';
    };
  }

  applyBuilderConfigToUI() {
    const bc = this.state.builderConfig;
    const set = (id, val) => { const el = this.inputs[id]; if (el) el.checked = val; };
    // Restore stamp radio
    const stampRadio = document.querySelector(`input[name="stamp-mode"][value="${this.state.stampMode}"]`);
    if (stampRadio) stampRadio.checked = true;
    // Restore search field button styles
    document.querySelectorAll('.search-field-btn').forEach(b => {
      const isActive = b.dataset.field === this.state.searchField;
      b.style.background = isActive ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)';
      b.style.color = isActive ? '#93c5fd' : 'rgba(255,255,255,0.3)';
    });
    const setVal = (id, val) => { const el = this.inputs[id]; if (el) el.value = val; };

    set('blHeader', bc.showHeader);
    set('blCustomer', bc.showCustomer);
    set('blOpening', bc.showOpening);
    set('blPayments', bc.showPayments);
    set('blCredits', bc.showCredits);
    set('blSummary', bc.showSummary);
    set('blNotes', bc.showNotes);
    set('formulaOverdue', bc.formulaOverdue);

  }

  readBuilderConfigFromUI() {
    const get = (id) => { const el = this.inputs[id]; return el ? (el.checked !== undefined ? el.checked : true) : true; };
    const getVal = (id) => { const el = this.inputs[id]; return el ? el.value : undefined; };
    return {
      showHeader: get('blHeader'),
      showCustomer: get('blCustomer'),
      showOpening: get('blOpening'),
      showPayments: get('blPayments'),
      showCredits: get('blCredits'),
      showSummary: get('blSummary'),
      showNotes: get('blNotes'),      formulaOverdue: get('formulaOverdue'),
    };
  }

  applyBuilderAndRender() {
    this.state.builderConfig = this.readBuilderConfigFromUI();
    localStorage.setItem('builder_config', JSON.stringify(this.state.builderConfig));

    // Read stamp config
    const sc = this.state.stampConfig;
    const gV = id => document.getElementById(id)?.value;
    sc.draftColor = gV('stamp-draft-color') || sc.draftColor;
    sc.finalColor = gV('stamp-final-color') || sc.finalColor;
    sc.stampFontSize = gV('stamp-font-size') || sc.stampFontSize;
    sc.stampPosition = gV('stamp-position') || sc.stampPosition;
    sc.stampRotation = gV('stamp-rotation') || sc.stampRotation;
    sc.stampOpacity = gV('stamp-opacity') || sc.stampOpacity;
    sc.stampBorderWidth = gV('stamp-border-width') || sc.stampBorderWidth;
    localStorage.setItem('biz_stamp_config', JSON.stringify(sc));

    // Read Final Bill T&C config
    const tc = this.state.termsConfig;
    tc.showOnFinal = document.getElementById('tc-show-final')?.checked ?? tc.showOnFinal;
    tc.showTitle = document.getElementById('tc-show-title')?.checked ?? tc.showTitle;
    tc.titleText = gV('tc-title-text') || tc.titleText;
    tc.color = gV('tc-color') || tc.color;
    tc.bgColor = gV('tc-bg-color') || tc.bgColor;
    tc.borderColor = gV('tc-border-color') || tc.borderColor;
    tc.fontSize = gV('tc-font-size') || tc.fontSize;
    const tcContent = document.getElementById('tc-content')?.value;
    if (tcContent !== undefined) {
      this.state.termsContent = tcContent;
      localStorage.setItem('biz_terms', tcContent);
    }
    // Read Draft Bill T&C config
    tc.showOnDraft = document.getElementById('tc-show-draft')?.checked ?? tc.showOnDraft;
    localStorage.setItem('biz_terms_config', JSON.stringify(tc));

    const tdc = this.state.termsDraftConfig;
    tdc.showTitle = document.getElementById('tc-show-title-draft')?.checked ?? tdc.showTitle;
    tdc.titleText = gV('tc-title-text-draft') || tdc.titleText;
    tdc.color = gV('tc-color-draft') || tdc.color;
    tdc.bgColor = gV('tc-bg-color-draft') || tdc.bgColor;
    tdc.borderColor = gV('tc-border-color-draft') || tdc.borderColor;
    tdc.fontSize = gV('tc-font-size-draft') || tdc.fontSize;
    const tcDraftContent = document.getElementById('tc-content-draft')?.value;
    if (tcDraftContent !== undefined) {
      this.state.termsDraftContent = tcDraftContent;
      localStorage.setItem('biz_terms_draft', tcDraftContent);
    }
    localStorage.setItem('biz_terms_draft_config', JSON.stringify(tdc));

    this.renderStatementUI();
  }

  // ─────────────────────────────────────────
  // DATE FILTER
  // ─────────────────────────────────────────
  handleDatePreset(val) {
    const now = new Date();
    const container = document.getElementById('custom-date-container');
    if (container) container.style.display = 'none';
    if (val === 'all') { this.state.filterDateStart = null; this.state.filterDateEnd = null; }
    else if (val === 'this_month') {
      this.state.filterDateStart = new Date(now.getFullYear(), now.getMonth(), 1);
      this.state.filterDateEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (val === 'last_month') {
      this.state.filterDateStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      this.state.filterDateEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (val === 'this_year') {
      this.state.filterDateStart = new Date(now.getFullYear(), 0, 1);
      this.state.filterDateEnd = new Date(now.getFullYear(), 11, 31);
    } else if (val === 'custom') {
      if (container) container.style.display = 'flex';
      return;
    }
    this.renderStatementUI();
  }

  updateDateFilter() {
    const s = this.inputs.dateStart?.value;
    const e = this.inputs.dateEnd?.value;
    if (s) this.state.filterDateStart = new Date(s);
    if (e) this.state.filterDateEnd = new Date(e);
    this.renderStatementUI();
  }

  // ─────────────────────────────────────────
  // RENDER DISPATCH
  // ─────────────────────────────────────────
  updateUIVisuals() {
    if (this.state.activeView === 'ledger') {
      this.renderStatementUI();
    } else {
      this.renderExplorer();
    }
    this.updateStats();
    this.autoFitZoom();
  }

  updateStats() {
    let total = 0;
    Object.values(this.state.dataStore).forEach(m => {
      Object.values(m).forEach(d => { total += (d.records || []).length; });
    });
    if (this.targets.stats) this.targets.stats.textContent = `${total} RECORDS`;
  }

  renderStatementUI() {
    const { renderArea, emptyState } = this.targets;
    const setBtnsDisabled = (v) => {
      [this.btns.downloadPdf, this.btns.downloadExcel, this.btns.print]
        .forEach(b => { if (b) b.disabled = v; });
    };

    if (this.state.selectedCustomerIds.size === 0) {
      if (emptyState) {
        emptyState.style.display = 'flex';
        const title = emptyState.querySelector('.empty-title');
        const sub = emptyState.querySelector('.empty-sub');
        if (title) title.textContent = 'No Customer Selected';
        if (sub) sub.textContent = 'Select a customer from the sidebar to generate their statement';
      }
      if (renderArea) renderArea.innerHTML = '';
      setBtnsDisabled(true);
      return;
    }
    if (emptyState) emptyState.style.display = 'none';
    setBtnsDisabled(false);

    this.renderLedgerStatement();
    this.autoFitZoom();
  }

  // ─────────────────────────────────────────
  // THEME HELPERS
  // ─────────────────────────────────────────
  getTheme() {
    return this.state.colors.find(c => c.name === this.state.theme) || this.state.colors[0];
  }

  getOrgName() {
    const sel = this.inputs.orgSelect;
    return (sel && sel.options && sel.options[sel.selectedIndex]) ? sel.options[sel.selectedIndex].text : 'Your Company';
  }

  // ─────────────────────────────────────────
  // PRICE EDITOR
  // ─────────────────────────────────────────
  // ── Price editor state for the current session ──────────────
  // this.state.activePriceSession = { fromDate, toDate, items: Map<name,{origRate,newRate}> } | null

  renderPriceEditor() {
    const list = this.views.priceEditorList;
    if (!list) return;

    const session = this.state.activePriceSession;

    if (!session) {
      // Show date-range picker
      list.innerHTML = this._buildPriceDatePickerHtml();
      this._bindPriceDatePicker(list);
      return;
    }

    // Session active — show item editor for the chosen range
    list.innerHTML = this._buildPriceItemEditorHtml(session);
    this._bindPriceItemEditor(list, session);
  }

  _buildPriceDatePickerHtml() {
    const rules = this.state.datePriceRules || [];
    const rulesHtml = rules.length === 0
      ? '<div style="font-size:0.6rem;color:rgba(255,255,255,0.2);text-align:center;padding:8px 0;">No saved rules yet</div>'
      : rules.map(r => `
          <div class="dpr-rule-chip">
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.62rem;font-weight:700;color:#fbbf24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.itemName}</div>
              <div style="font-size:0.55rem;color:rgba(255,255,255,0.3);margin-top:1px;">${r.fromDate||'open'} → ${r.toDate||'open'} · <span style="color:#34d399;font-family:'DM Mono',monospace;">${this.state.currency} ${parseFloat(r.price).toFixed(2)}</span></div>
            </div>
            <button data-del-rule="${r.id}" style="background:rgba(220,38,38,0.12);color:#f87171;border:1px solid rgba(220,38,38,0.18);border-radius:4px;padding:2px 6px;font-size:0.6rem;cursor:pointer;flex-shrink:0;">✕</button>
          </div>`).join('');

    return `
      <div class="pe-section-label">Select Date Range to Edit</div>
      <div style="font-size:0.6rem;color:rgba(255,255,255,0.25);margin-bottom:8px;line-height:1.5;">Pick a date range, then set prices for items invoiced in that period. Leave dates blank to edit all items.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px;">
        <div>
          <div style="font-size:0.55rem;color:rgba(255,255,255,0.25);margin-bottom:3px;">From Date</div>
          <input type="date" id="pe-range-from" class="pe-date-input">
        </div>
        <div>
          <div style="font-size:0.55rem;color:rgba(255,255,255,0.25);margin-bottom:3px;">To Date</div>
          <input type="date" id="pe-range-to" class="pe-date-input">
        </div>
      </div>
      <button id="pe-range-edit-btn" style="width:100%;padding:7px;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:white;border:none;border-radius:7px;font-size:0.68rem;font-weight:800;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:0.05em;">
        <i class="ph ph-pencil"></i> Load Items for Range
      </button>
      <div style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;">
        <div class="pe-section-label" style="margin-bottom:5px;">Saved Price Rules (${rules.length})</div>
        ${rulesHtml}
      </div>`;
  }

  _bindPriceDatePicker(list) {
    list.querySelector('#pe-range-edit-btn')?.addEventListener('click', () => {
      const from = list.querySelector('#pe-range-from')?.value || null;
      const to   = list.querySelector('#pe-range-to')?.value   || null;
      this._openPriceSession(from, to);
    });
    list.querySelectorAll('[data-del-rule]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.delRule;
        this.state.datePriceRules = this.state.datePriceRules.filter(r => r.id !== id);
        localStorage.setItem('biz_date_price_rules', JSON.stringify(this.state.datePriceRules));
        this.renderPriceEditor();
        this.renderStatementUI();
      });
    });
  }

  _openPriceSession(fromDate, toDate) {
    // Collect all unique items active in this date range
    const itemMap = new Map();
    this.state.selectedCustomerIds.forEach(cid => {
      (this.state.dataStore.invoices[cid]?.records || []).forEach(inv => {
        // Date filter
        if (fromDate || toDate) {
          const d = new Date(inv.date);
          if (fromDate && d < new Date(fromDate)) return;
          if (toDate   && d > new Date(toDate))   return;
        }
        const det = this.state.invoiceDetailsCache[inv.invoice_id];
        (det?.line_items || []).forEach(li => {
          if (!itemMap.has(li.name)) {
            const groupName = li.item_custom_fields?.find(f => f.label?.toLowerCase().includes('group'))?.value || '';
            itemMap.set(li.name, { name: li.name, origRate: parseFloat(li.rate || 0), groupName, newRate: null });
          }
        });
      });
    });

    if (itemMap.size === 0) {
      // No items in range — still open session so user can add manually
    }

    // Check conflicts with existing rules
    const conflicts = [];
    if (fromDate || toDate) {
      (this.state.datePriceRules || []).forEach(rule => {
        const rFrom = rule.fromDate ? new Date(rule.fromDate) : null;
        const rTo   = rule.toDate   ? new Date(rule.toDate)   : null;
        const sFrom = fromDate      ? new Date(fromDate)       : null;
        const sTo   = toDate        ? new Date(toDate)         : null;
        // Overlap detection
        const startsBefore = !sFrom || !rTo   || sFrom <= rTo;
        const endsAfter    = !sTo   || !rFrom || sTo   >= rFrom;
        if (startsBefore && endsAfter) conflicts.push(rule);
      });
    }

    if (conflicts.length > 0) {
      // Build conflict warning UI
      this._showConflictWarning(conflicts, fromDate, toDate, itemMap);
      return;
    }

    this.state.activePriceSession = { fromDate, toDate, items: itemMap };
    this.renderPriceEditor();
  }

  _showConflictWarning(conflicts, fromDate, toDate, itemMap) {
    const list = this.views.priceEditorList;
    if (!list) return;
    const conflictRows = conflicts.map(r => `
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:6px;padding:6px 9px;margin-bottom:4px;">
        <div style="font-size:0.62rem;font-weight:700;color:#fbbf24;">${r.itemName}</div>
        <div style="font-size:0.55rem;color:rgba(255,255,255,0.35);margin-top:1px;">${r.fromDate||'open'} → ${r.toDate||'open'} · ${this.state.currency} ${parseFloat(r.price).toFixed(2)}</div>
      </div>`).join('');

    list.innerHTML = `
      <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
        <div style="font-size:0.68rem;font-weight:800;color:#fbbf24;margin-bottom:6px;">⚠ Date Range Conflict</div>
        <div style="font-size:0.6rem;color:rgba(255,255,255,0.4);margin-bottom:8px;line-height:1.5;">The selected range overlaps with ${conflicts.length} existing rule(s). Proceeding will create new rules alongside the existing ones.</div>
        <div style="margin-bottom:8px;">${conflictRows}</div>
        <div style="display:flex;gap:6px;">
          <button id="pe-conflict-proceed" style="flex:1;padding:6px;background:#d97706;color:white;border:none;border-radius:6px;font-size:0.65rem;font-weight:800;cursor:pointer;font-family:'DM Sans',sans-serif;">Continue Anyway</button>
          <button id="pe-conflict-cancel"  style="flex:1;padding:6px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:0.65rem;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;">Go Back</button>
        </div>
      </div>`;
    list.querySelector('#pe-conflict-proceed')?.addEventListener('click', () => {
      this.state.activePriceSession = { fromDate, toDate, items: itemMap };
      this.renderPriceEditor();
    });
    list.querySelector('#pe-conflict-cancel')?.addEventListener('click', () => {
      this.renderPriceEditor();
    });
  }

  _buildPriceItemEditorHtml(session) {
    const from = session.fromDate || 'All';
    const to   = session.toDate   || 'All';
    const items = Array.from(session.items.values());
    const rules = this.state.datePriceRules || [];

    // --- Two-level grouping with named product families ---
    // Known two-word product families take priority over single-word matching.
    // e.g. "Grow Care 2M" → family "Grow Care", NOT just "Grow"
    // Single-word families: Sapphire, Mega, Tomboy, Sun, Leeder (and any other first-word match with 2+ items)
    const TWO_WORD_FAMILIES = ['grow care', 'grow excel'];

    const getFamily = (name) => {
      const lower = name.toLowerCase();
      // Check two-word families first
      for (const fam of TWO_WORD_FAMILIES) {
        if (lower.startsWith(fam)) return fam;
      }
      // Fall back to first word
      return lower.split(/[\s_\-\/]/)[0];
    };

    const getFamilyLabel = (name) => {
      const lower = name.toLowerCase();
      for (const fam of TWO_WORD_FAMILIES) {
        if (lower.startsWith(fam)) {
          // Title-case the two-word family from the actual item name
          return name.slice(0, fam.length);
        }
      }
      return name.split(/[\s_\-\/]/)[0];
    };

    const mainGroups = new Map(); // familyKey -> { label, items[] }
    const ungrouped = [];

    // Count items per family
    const familyCount = new Map();
    items.forEach(item => {
      const fk = getFamily(item.name);
      familyCount.set(fk, (familyCount.get(fk) || 0) + 1);
    });

    items.forEach(item => {
      const fk = getFamily(item.name);
      if (familyCount.get(fk) > 1) {
        if (!mainGroups.has(fk)) {
          mainGroups.set(fk, { label: getFamilyLabel(item.name), items: [] });
        }
        mainGroups.get(fk).items.push(item);
      } else {
        ungrouped.push(item);
      }
    });

    // Helper to get effective price for an item
    const getEP = (item) => {
      const saved = rules.find(r => r.itemName === item.name &&
        (r.fromDate||null) === (session.fromDate||null) &&
        (r.toDate  ||null) === (session.toDate  ||null));
      return item.newRate !== null ? item.newRate : (saved ? parseFloat(saved.price) : item.origRate);
    };

    let rowsHtml = '';
    if (items.length === 0) {
      rowsHtml = '<div style="font-size:0.62rem;color:rgba(255,255,255,0.2);text-align:center;padding:10px 0;">No items found in this date range</div>';
    } else {
      // Render main groups with two-level collapsible structure
      mainGroups.forEach((mainGroup, fw) => {
        const mainGroupId = 'mg_' + fw.replace(/[^a-z0-9]/gi, '_');
        const isAnySet = mainGroup.items.some(item => {
          const saved = rules.find(r => r.itemName === item.name &&
            (r.fromDate||null) === (session.fromDate||null) &&
            (r.toDate  ||null) === (session.toDate  ||null));
          return item.newRate !== null || saved;
        });

        // Build subgroups by same effective price within this main group
        const priceSubgroups = new Map(); // priceKey -> { price, items[] }
        const soloItems = [];
        const subPriceCount = new Map();
        mainGroup.items.forEach(item => {
          const ep = getEP(item);
          const pk = parseFloat(ep).toFixed(2);
          subPriceCount.set(pk, (subPriceCount.get(pk) || 0) + 1);
        });
        mainGroup.items.forEach(item => {
          const ep = getEP(item);
          const pk = parseFloat(ep).toFixed(2);
          if (subPriceCount.get(pk) > 1) {
            if (!priceSubgroups.has(pk)) priceSubgroups.set(pk, { price: ep, items: [] });
            priceSubgroups.get(pk).items.push(item);
          } else {
            soloItems.push(item);
          }
        });

        // Compute a display price for the main group header (most common price, or first)
        const allPrices = mainGroup.items.map(i => parseFloat(getEP(i)).toFixed(2));
        const priceFreq = allPrices.reduce((m,p)=>{m.set(p,(m.get(p)||0)+1);return m;}, new Map());
        const dominantPrice = [...priceFreq.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || '0.00';
        const allSamePrice = priceFreq.size === 1;

        rowsHtml += `
          <div class="price-smart-group" style="margin-bottom:8px;border:1px solid ${isAnySet ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.1)'};border-radius:10px;overflow:hidden;">
            <div class="sg-header" data-sg="${mainGroupId}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;cursor:pointer;background:${isAnySet ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)'};user-select:none;gap:8px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:0.74rem;font-weight:800;color:${isAnySet ? '#93c5fd' : 'rgba(255,255,255,0.8)'};">${mainGroup.label}</div>
                <div style="font-size:0.56rem;color:rgba(255,255,255,0.3);margin-top:2px;">${mainGroup.items.length} variants${allSamePrice ? ' · all same price' : ' · mixed prices'}</div>
              </div>
              ${allSamePrice ? `
              <div style="display:flex;align-items:center;gap:4px;" onclick="event.stopPropagation()">
                <span style="font-size:0.57rem;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;">${this.state.currency}</span>
                <input type="number" class="pe-group-input" data-group="${mainGroupId}" data-items="${mainGroup.items.map(i=>encodeURIComponent(i.name)).join(',')}" value="${dominantPrice}" step="0.01" min="0" title="Edit all ${mainGroup.items.length} items at once" style="width:72px;background:rgba(255,255,255,0.1);border:1px solid ${isAnySet ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.18)'};color:${isAnySet ? '#93c5fd' : 'white'};border-radius:5px;padding:4px 6px;font-size:0.7rem;font-family:'DM Mono',monospace;outline:none;color-scheme:dark;text-align:right;">
              </div>` : `<span style="font-size:0.62rem;font-weight:700;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.35);">mixed</span>`}
              <span class="sg-chevron" style="font-size:0.6rem;color:rgba(255,255,255,0.3);transition:transform 0.2s;flex-shrink:0;">&#9660;</span>
            </div>
            <div id="${mainGroupId}" style="display:none;padding:6px 8px 8px;border-top:1px solid rgba(255,255,255,0.07);">`;

        // Render price subgroups inside the main group
        priceSubgroups.forEach((subGroup, pk) => {
          const subGroupId = mainGroupId + '_p' + pk.replace('.','_');
          const subIsAnySet = subGroup.items.some(item => {
            const saved = rules.find(r => r.itemName === item.name &&
              (r.fromDate||null) === (session.fromDate||null) &&
              (r.toDate  ||null) === (session.toDate  ||null));
            return item.newRate !== null || saved;
          });
          rowsHtml += `
            <div style="margin-bottom:5px;border:1px solid ${subIsAnySet ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)'};border-radius:7px;overflow:hidden;">
              <div class="sg-header" data-sg="${subGroupId}" style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;cursor:pointer;background:${subIsAnySet ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)'};user-select:none;gap:6px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:0.63rem;font-weight:700;color:${subIsAnySet ? '#a5b4fc' : 'rgba(255,255,255,0.55)'};">${subGroup.items.length} items @ ${this.state.currency} ${parseFloat(pk).toLocaleString(undefined,{minimumFractionDigits:2})}</div>
                </div>
                <div style="display:flex;align-items:center;gap:4px;" onclick="event.stopPropagation()">
                  <span style="font-size:0.55rem;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;">${this.state.currency}</span>
                  <input type="number" class="pe-group-input" data-group="${subGroupId}" data-items="${subGroup.items.map(i=>encodeURIComponent(i.name)).join(',')}" value="${parseFloat(pk).toFixed(2)}" step="0.01" min="0" title="Edit all ${subGroup.items.length} items in this subgroup" style="width:68px;background:rgba(255,255,255,0.08);border:1px solid ${subIsAnySet ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.15)'};color:${subIsAnySet ? '#a5b4fc' : 'white'};border-radius:5px;padding:3px 5px;font-size:0.67rem;font-family:'DM Mono',monospace;outline:none;color-scheme:dark;text-align:right;">
                </div>
                <span class="sg-chevron" style="font-size:0.55rem;color:rgba(255,255,255,0.25);transition:transform 0.2s;flex-shrink:0;">&#9660;</span>
              </div>
              <div id="${subGroupId}" style="display:none;padding:4px 6px 5px;border-top:1px solid rgba(255,255,255,0.05);">`;
          subGroup.items.forEach(item => {
            const saved = rules.find(r => r.itemName === item.name &&
              (r.fromDate||null) === (session.fromDate||null) &&
              (r.toDate  ||null) === (session.toDate  ||null));
            const displayVal = item.newRate !== null ? item.newRate : (saved ? saved.price : item.origRate);
            const isSet = item.newRate !== null || saved;
            rowsHtml += `
              <div class="price-item-row${isSet ? ' overridden' : ''}" data-item="${encodeURIComponent(item.name)}" style="border-radius:5px;padding:5px 7px;margin-bottom:3px;background:${isSet ? 'rgba(59,130,246,0.07)' : 'rgba(255,255,255,0.02)'};border:1px solid ${isSet ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)'};">
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
                  <button class="pe-reset-btn" data-item="${encodeURIComponent(item.name)}" title="Reset" style="background:rgba(220,38,38,0.1);color:#f87171;border:1px solid rgba(220,38,38,0.18);border-radius:4px;padding:1px 4px;font-size:0.57rem;cursor:pointer;flex-shrink:0;line-height:1.2;">&#x21BA;</button>
                  <div class="price-item-name" style="flex:1;color:${isSet ? '#e2e8f0' : 'rgba(255,255,255,0.5)'};font-size:0.63rem;font-weight:${isSet ? '700' : '400'};">${item.name}</div>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                  <span style="font-size:0.56rem;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;flex-shrink:0;">${this.state.currency}</span>
                  <input type="number" class="pe-item-input${isSet ? ' changed' : ''}" data-item="${encodeURIComponent(item.name)}" data-orig="${item.origRate}" value="${parseFloat(displayVal).toFixed(2)}" step="0.01" min="0" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid ${isSet ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'};color:${isSet ? '#93c5fd' : 'white'};border-radius:5px;padding:3px 5px;font-size:0.66rem;font-family:'DM Mono',monospace;outline:none;width:100%;color-scheme:dark;">
                </div>
                ${isSet ? `<div style="font-size:0.5rem;color:rgba(255,255,255,0.2);margin-top:2px;font-family:'DM Mono',monospace;">zoho: ${item.origRate.toLocaleString(undefined,{minimumFractionDigits:2})}</div>` : ''}
              </div>`;
          });
          rowsHtml += `</div></div>`;
        });

        // Solo items (unique price in this main group) — render directly
        soloItems.forEach(item => {
          const saved = rules.find(r => r.itemName === item.name &&
            (r.fromDate||null) === (session.fromDate||null) &&
            (r.toDate  ||null) === (session.toDate  ||null));
          const displayVal = item.newRate !== null ? item.newRate : (saved ? saved.price : item.origRate);
          const isSet = item.newRate !== null || saved;
          rowsHtml += `
            <div class="price-item-row${isSet ? ' overridden' : ''}" data-item="${encodeURIComponent(item.name)}" style="border-radius:6px;padding:5px 8px;margin-bottom:4px;background:${isSet ? 'rgba(59,130,246,0.07)' : 'rgba(255,255,255,0.02)'};border:1px solid ${isSet ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)'};">
              <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                <button class="pe-reset-btn" data-item="${encodeURIComponent(item.name)}" title="Reset" style="background:rgba(220,38,38,0.1);color:#f87171;border:1px solid rgba(220,38,38,0.18);border-radius:4px;padding:2px 5px;font-size:0.6rem;cursor:pointer;flex-shrink:0;line-height:1.2;">&#x21BA;</button>
                <div class="price-item-name" style="flex:1;color:${isSet ? '#e2e8f0' : 'rgba(255,255,255,0.55)'};font-size:0.67rem;font-weight:${isSet ? '700' : '500'};">${item.name}</div>
              </div>
              <div style="display:flex;align-items:center;gap:5px;">
                <span style="font-size:0.58rem;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;flex-shrink:0;">${this.state.currency}</span>
                <input type="number" class="pe-item-input${isSet ? ' changed' : ''}" data-item="${encodeURIComponent(item.name)}" data-orig="${item.origRate}" value="${parseFloat(displayVal).toFixed(2)}" step="0.01" min="0" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid ${isSet ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'};color:${isSet ? '#93c5fd' : 'white'};border-radius:5px;padding:4px 6px;font-size:0.68rem;font-family:'DM Mono',monospace;outline:none;width:100%;color-scheme:dark;">
              </div>
              ${isSet ? `<div style="font-size:0.52rem;color:rgba(255,255,255,0.25);margin-top:2px;font-family:'DM Mono',monospace;">zoho: ${item.origRate.toLocaleString(undefined,{minimumFractionDigits:2})}</div>` : ''}
            </div>`;
        });

        rowsHtml += `</div></div>`; // close mainGroupId body + main group wrapper
      });

      // Render ungrouped items
      if (ungrouped.length > 0) {
        if (mainGroups.size > 0) rowsHtml += `<div class="price-group-label" style="margin-top:8px;">Other Items</div>`;
        ungrouped.forEach(item => {
          const saved = rules.find(r => r.itemName === item.name &&
            (r.fromDate||null) === (session.fromDate||null) &&
            (r.toDate  ||null) === (session.toDate  ||null));
          const displayVal = item.newRate !== null ? item.newRate : (saved ? saved.price : item.origRate);
          const isSet = item.newRate !== null || saved;
          rowsHtml += `
            <div class="price-item-row${isSet ? ' overridden' : ''}" data-item="${encodeURIComponent(item.name)}" style="border-radius:7px;padding:7px 9px;margin-bottom:5px;background:${isSet ? 'rgba(59,130,246,0.07)' : 'rgba(255,255,255,0.03)'};border:1px solid ${isSet ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.06)'};">
              <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                <button class="pe-reset-btn" data-item="${encodeURIComponent(item.name)}" title="Reset this item" style="background:rgba(220,38,38,0.1);color:#f87171;border:1px solid rgba(220,38,38,0.18);border-radius:4px;padding:2px 6px;font-size:0.65rem;cursor:pointer;flex-shrink:0;line-height:1.2;">&#x21BA;</button>
                <div class="price-item-name" style="flex:1;color:${isSet ? '#e2e8f0' : 'rgba(255,255,255,0.55)'};font-size:0.7rem;font-weight:${isSet ? '700' : '500'};">${item.name}</div>
              </div>
              <div style="display:flex;align-items:center;gap:5px;">
                <span style="font-size:0.58rem;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;flex-shrink:0;">${this.state.currency}</span>
                <input type="number" class="pe-item-input${isSet ? ' changed' : ''}" data-item="${encodeURIComponent(item.name)}" data-orig="${item.origRate}" value="${parseFloat(displayVal).toFixed(2)}" step="0.01" min="0" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid ${isSet ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'};color:${isSet ? '#93c5fd' : 'white'};border-radius:5px;padding:5px 7px;font-size:0.72rem;font-family:'DM Mono',monospace;outline:none;width:100%;color-scheme:dark;">
              </div>
              ${isSet ? `<div style="font-size:0.55rem;color:rgba(255,255,255,0.25);margin-top:3px;font-family:'DM Mono',monospace;">zoho rate: ${item.origRate.toLocaleString(undefined,{minimumFractionDigits:2})}</div>` : ''}
            </div>`;
        });
      }
    }
    return `
      <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.22);border-radius:8px;padding:8px 10px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:0.5rem;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;color:rgba(255,255,255,0.25);margin-bottom:2px;">Editing Range</div>
          <div style="font-size:0.68rem;font-weight:800;color:#93c5fd;">${from} → ${to}</div>
          <div style="font-size:0.58rem;color:rgba(255,255,255,0.3);margin-top:1px;">${items.length} item(s) · ${mainGroups.size > 0 ? mainGroups.size + ' group(s)' : 'no groups'}</div>
        </div>
        <button id="pe-back-btn" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:4px 10px;font-size:0.6rem;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s;">← Back</button>
      </div>
      <div style="position:relative;margin-bottom:8px;">
        <input id="pe-item-search" type="text" placeholder="Search items…" style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:7px;padding:6px 10px 6px 28px;font-size:0.68rem;font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;color-scheme:dark;">
        <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.3);font-size:0.7rem;pointer-events:none;">🔍</span>
      </div>
      <div id="pe-item-rows">${rowsHtml}</div>
      <div style="display:flex;gap:5px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
        <button id="pe-save-rules-btn" style="flex:1;padding:7px 5px;background:linear-gradient(135deg,#065f46,#059669);color:white;border:none;border-radius:7px;font-size:0.65rem;font-weight:800;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:0.04em;transition:all 0.15s;">
          ✓ Save All Rules
        </button>
        <button id="pe-reset-all-btn" style="padding:7px 10px;background:rgba(220,38,38,0.1);color:#f87171;border:1px solid rgba(220,38,38,0.2);border-radius:7px;font-size:0.7rem;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;" title="Reset all items in this range">↺</button>
      </div>`;
  }

  _bindPriceItemEditor(list, session) {
    // Group-level price input — updates all items in the group at once
    list.querySelectorAll('.pe-group-input').forEach(input => {
      input.addEventListener('input', () => {
        const newRate = parseFloat(input.value);
        if (isNaN(newRate)) return;
        const itemNames = input.dataset.items.split(',').map(n => decodeURIComponent(n));
        itemNames.forEach(name => {
          const item = session.items.get(name);
          if (item) item.newRate = newRate;
          this.state.priceOverrides[name] = newRate;
          // Also update the individual pe-item-input for this item
          const itemInput = list.querySelector(`.pe-item-input[data-item="${encodeURIComponent(name)}"]`);
          if (itemInput) {
            itemInput.value = newRate.toFixed(2);
            itemInput.classList.add('changed');
          }
        });
        this.renderStatementUI();
      });
    });

    // Smart group expand/collapse
    list.querySelectorAll('.sg-header').forEach(header => {
      header.addEventListener('click', () => {
        const sgId = header.dataset.sg;
        const body = document.getElementById(sgId);
        const chevron = header.querySelector('.sg-chevron');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      });
    });
    // Item search filter
    list.querySelector('#pe-item-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      list.querySelectorAll('.price-item-row').forEach(row => {
        const name = row.querySelector('.price-item-name')?.textContent?.toLowerCase() || '';
        row.style.display = (!q || name.includes(q)) ? '' : 'none';
      });
      list.querySelectorAll('.price-group-label').forEach(lbl => {
        // Hide group label if all its items are hidden
        let next = lbl.nextElementSibling;
        let anyVisible = false;
        while (next && !next.classList.contains('price-group-label')) {
          if (next.style.display !== 'none') anyVisible = true;
          next = next.nextElementSibling;
        }
        lbl.style.display = anyVisible ? '' : 'none';
      });
    });

    // Live preview on input
    list.querySelectorAll('.pe-item-input').forEach(input => {
      input.addEventListener('input', () => {
        const name = decodeURIComponent(input.dataset.item);
        const newRate = parseFloat(input.value);
        const item = session.items.get(name);
        if (item) item.newRate = isNaN(newRate) ? null : newRate;
        // Live preview in statement
        if (!isNaN(newRate)) {
          this.state.priceOverrides[name] = newRate;
        } else {
          delete this.state.priceOverrides[name];
        }
        this.renderStatementUI();
      });
    });

    // Per-item reset
    list.querySelectorAll('.pe-reset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = decodeURIComponent(btn.dataset.item);
        const item = session.items.get(name);
        if (item) { item.newRate = null; }
        delete this.state.priceOverrides[name];
        const row = btn.closest('.price-item-row');
        const inp = row?.querySelector('.pe-item-input');
        if (inp) { inp.value = parseFloat(inp.dataset.orig).toFixed(2); inp.classList.remove('changed'); }
        row?.classList.remove('overridden');
        row?.querySelector('.price-orig-val')?.remove();
        this.renderStatementUI();
      });
    });

    // Back button
    list.querySelector('#pe-back-btn')?.addEventListener('click', () => {
      this.state.activePriceSession = null;
      // Clear priceOverrides set during this session preview
      this.state.priceOverrides = {};
      this.renderPriceEditor();
      this.renderStatementUI();
    });

    // Reset all in range
    list.querySelector('#pe-reset-all-btn')?.addEventListener('click', () => {
      session.items.forEach(item => { item.newRate = null; });
      this.state.priceOverrides = {};
      this.renderPriceEditor();
      this.renderStatementUI();
    });

    // Save rules
    list.querySelector('#pe-save-rules-btn')?.addEventListener('click', () => {
      let savedCount = 0;
      session.items.forEach((item, name) => {
        if (item.newRate !== null && item.newRate !== item.origRate) {
          // Remove any existing rule for same item + same range
          this.state.datePriceRules = this.state.datePriceRules.filter(r =>
            !(r.itemName === name &&
              (r.fromDate||null) === (session.fromDate||null) &&
              (r.toDate  ||null) === (session.toDate  ||null))
          );
          this.state.datePriceRules.push({
            id: Date.now().toString() + '_' + Math.random().toString(36).slice(2,6),
            itemName: name,
            fromDate: session.fromDate || null,
            toDate:   session.toDate   || null,
            price:    item.newRate,
          });
          savedCount++;
        }
      });
      localStorage.setItem('biz_date_price_rules', JSON.stringify(this.state.datePriceRules));
      // End session, go back to picker
      this.state.activePriceSession = null;
      this.state.priceOverrides = {};
      this.renderPriceEditor();
      this.renderStatementUI();
      this.log(`${savedCount} price rule(s) saved`);
    });
  }

  resetAllPrices() {
    this.state.priceOverrides = {};
    this.state.activePriceSession = null;
    this.state.datePriceRules = [];
    localStorage.removeItem('biz_date_price_rules');
    this.renderPriceEditor();
    this.renderStatementUI();
  }

  // Apply price overrides to get effective rate for a line item
  // Checks date-based price rules first, then flat override, then Zoho rate
  getEffectiveRate(li, txDate) {
    // Check date-based price rules (most specific wins — shortest date range)
    const rules = (this.state.datePriceRules || []).filter(r => r.itemName === li.name);
    if (rules.length > 0 && txDate) {
      const d = new Date(txDate);
      const matching = rules.filter(r => {
        const from = r.fromDate ? new Date(r.fromDate) : null;
        const to = r.toDate ? new Date(r.toDate) : null;
        const afterFrom = !from || d >= from;
        const beforeTo = !to || d <= to;
        return afterFrom && beforeTo;
      });
      if (matching.length > 0) {
        // Pick the most specific rule (smallest date range)
        matching.sort((a, b) => {
          const aRange = a.fromDate && a.toDate ? (new Date(a.toDate) - new Date(a.fromDate)) : Infinity;
          const bRange = b.fromDate && b.toDate ? (new Date(b.toDate) - new Date(b.fromDate)) : Infinity;
          return aRange - bRange;
        });
        return parseFloat(matching[0].price);
      }
    }
    // Flat override
    const override = this.state.priceOverrides[li.name];
    return override !== undefined ? override : parseFloat(li.rate || 0);
  }

  // Recalculate invoice total using any price overrides or date rules
  getEffectiveInvoiceTotal(inv) {
    const det = this.state.invoiceDetailsCache[inv.invoice_id];
    const hasDateRules = (this.state.datePriceRules || []).length > 0;
    const hasFlatOverrides = Object.keys(this.state.priceOverrides).length > 0;
    if (!det || !det.line_items || (!hasFlatOverrides && !hasDateRules)) {
      return parseFloat(inv.total) || 0;
    }
    const txDate = inv.date;
    const hasOverride = det.line_items.some(li => {
      const rate = this.getEffectiveRate(li, txDate);
      return rate !== parseFloat(li.rate || 0);
    });
    if (!hasOverride) return parseFloat(inv.total) || 0;
    return det.line_items.reduce((sum, li) => {
      return sum + this.getEffectiveRate(li, txDate) * parseFloat(li.quantity || 1);
    }, 0);
  }

  // ─────────────────────────────────────────
  // LEDGER SOA STATEMENT
  // ─────────────────────────────────────────
  renderLedgerStatement() {
    const bc = this.state.builderConfig;
    const theme = this.getTheme();
    const orgName = this.getOrgName();
    let html = '';

    this.state.selectedCustomerIds.forEach(id => {
      const customer = this.state.customerFullDetails[id] || {};
      const clientName = customer.contact_name || 'Valued Client';
      const systemOpeningBalance = this.getEffectiveOpeningBalance(id);

      let transactions = this.collectTransactions(id);
      transactions = this.applySortAndFilter(transactions, bc);

      // Pre-filter opening balance
      let balanceBroughtForward = systemOpeningBalance;
      if (this.state.filterDateStart) {
        const allTx = this.collectTransactions(id);
        let temp = systemOpeningBalance;
        allTx.filter(t => t.sortDate < this.state.filterDateStart).forEach(t => { temp += t.amount - t.payment; });
        balanceBroughtForward = temp;
      }

      let runningBalance = balanceBroughtForward;
      let totalInvoiced = 0, totalReceived = 0, totalCredits = 0;

      const openingRow = bc.showOpening ? `
        <tr style="background:#f8fafc;">
          <td colspan="2" style="padding:10px 8px;font-weight:800;font-style:italic;font-size:10px;">
            ${this.state.filterDateStart ? `BALANCE AS OF ${this.state.filterDateStart.toLocaleDateString()}` : 'OPENING BALANCE'}
          </td>
          <td style="padding:10px 8px;font-size:9px;color:#64748b;font-style:italic;">Balance brought forward</td>
          <td colspan="2" style="padding:10px 8px;text-align:right;color:#94a3b8;font-size:10px;">—</td>
          <td style="padding:10px 8px;text-align:right;font-weight:800;font-size:10px;white-space:nowrap;">${balanceBroughtForward.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        </tr>
      ` : '';

      let rowsHtml = openingRow;
      const now = new Date();

      transactions.forEach(tx => {
        runningBalance += tx.amount - tx.payment;
        if (tx.amount > 0) totalInvoiced += tx.amount;
        if (tx.payment > 0) { if (tx.type === 'Credit Note') totalCredits += tx.payment; else totalReceived += tx.payment; }

        // Skip payments if showPayments is off
        if (!bc.showPayments && tx.type === 'Payment Received') return;
        if (!bc.showCredits && tx.type === 'Credit Note') return;

        let payDisplay = '';
        if (tx.payment !== 0) {
          const color = tx.type === 'Credit Note' ? '#dc2626' : '#059669';
          payDisplay = `<span style="color:${color};font-weight:700;">${tx.payment.toLocaleString(undefined, {minimumFractionDigits:2})}</span>`;
        }

        // Details cell — qty & rate inline with item name
        let detailsHtml = '';
        if (!this.state.isSummaryMode) {
          if (tx.type === 'Invoice') {
            const det = this.state.invoiceDetailsCache[tx.raw.invoice_id];
            detailsHtml = `<div style="font-weight:800;color:${theme.primary};font-size:10px;margin-bottom:4px;">Invoice #${tx.ref}</div>`;
            if (det && det.line_items) {
              det.line_items.forEach(li => {
                const groupName = li.item_custom_fields?.find(f => f.label?.toLowerCase().includes('group'))?.value || '';
                const effectiveRate = this.getEffectiveRate(li, tx.date);
                detailsHtml += `
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:5px 0;border-bottom:1px solid #f0f2f5;">
                    <div style="min-width:0;">
                      ${groupName ? `<span style="font-size:8px;color:${theme.accent};font-weight:700;display:block;margin-bottom:1px;">${groupName}</span>` : ''}
                      <span style="font-weight:700;color:#1e293b;font-size:10px;">${li.name}</span>
                    </div>
                    <span style="white-space:nowrap;font-size:10px;color:#1e293b;font-family:'DM Mono',monospace;font-weight:700;flex-shrink:0;">${parseFloat(li.quantity)} &times; ${effectiveRate.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                  </div>`;
              });
            }
          } else if (tx.type === 'Payment Received') {
            detailsHtml = `<div style="color:#059669;font-weight:700;font-size:10px;">Payment Received</div>`;
            if (tx.raw?.invoices?.length) {
              detailsHtml += `<div style="font-size:9px;color:#64748b;margin-top:3px;">Against: ${tx.raw.invoices.map(i => i.invoice_number).join(', ')}</div>`;
            }
          } else if (tx.type === 'Credit Note') {
            const det = this.state.invoiceDetailsCache[tx.raw.creditnote_id];
            detailsHtml = `<div style="color:#dc2626;font-weight:800;font-size:10px;margin-bottom:4px;">Credit Note #${tx.ref}</div>`;
            if (det && det.line_items) {
              det.line_items.forEach(li => {
                detailsHtml += `
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:5px 0;border-bottom:1px solid #f0f2f5;">
                    <span style="font-weight:700;color:#1e293b;font-size:10px;">${li.name}</span>
                    <span style="white-space:nowrap;font-size:10px;color:#1e293b;font-family:'DM Mono',monospace;font-weight:700;flex-shrink:0;">${parseFloat(li.quantity)} &times; ${this.getEffectiveRate(li, tx.date).toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                  </div>`;
              });
            }
          }
        } else {
          if (tx.type === 'Invoice') detailsHtml = `<span style="font-weight:700;color:${theme.primary};">Invoice #${tx.ref}</span>`;
          else if (tx.type === 'Payment Received') detailsHtml = `<span style="font-weight:700;color:#059669;">Payment (${tx.ref})</span>`;
          else if (tx.type === 'Credit Note') detailsHtml = `<span style="font-weight:700;color:#dc2626;">Credit Note #${tx.ref}</span>`;
        }

        const borderStyle = this.state.tableBorders ? `border:1px solid #111;` : ``;
        rowsHtml += `
          <tr class="ledger-item-row" style="border-bottom:1px solid ${this.state.tableBorders ? '#111' : '#f1f5f9'};">
            <td style="padding:10px 8px;font-weight:700;color:#64748b;font-size:10px;white-space:nowrap;vertical-align:top;${borderStyle}">${tx.date}</td>
            <td style="padding:10px 8px;font-weight:800;color:${theme.primary};font-size:9px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;vertical-align:top;${borderStyle}">${tx.type}</td>
            <td style="padding:10px 8px;font-size:10px;line-height:1.5;vertical-align:top;${borderStyle}">${detailsHtml}</td>
            <td style="padding:10px 8px;text-align:right;font-weight:700;font-size:10px;white-space:nowrap;vertical-align:top;${tx.amount<0?'color:#dc2626;':''}${borderStyle}" contenteditable="${!this.state.isSummaryMode}">${tx.amount !== 0 ? Math.abs(tx.amount).toLocaleString(undefined,{minimumFractionDigits:2}) : ''}</td>
            <td style="padding:10px 8px;text-align:right;font-size:10px;white-space:nowrap;vertical-align:top;${borderStyle}" contenteditable="${!this.state.isSummaryMode}">${payDisplay}</td>
            <td style="padding:10px 8px;text-align:right;font-weight:800;font-size:10px;white-space:nowrap;color:${theme.primary};vertical-align:top;${borderStyle}">${runningBalance.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
          </tr>
        `;
      });

      const summaryHtml = bc.showSummary ? `
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:1.5rem;padding-top:1.5rem;border-top:2px solid ${theme.primary}20;">
          <div>
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;color:${theme.accent};margin-bottom:1rem;">Account Summary</div>
            <table style="font-size:10px;font-weight:600;color:#475569;border-collapse:collapse;">
              <tr><td style="padding:4px 40px 4px 0;">Opening Balance</td><td style="text-align:right;">${balanceBroughtForward.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
              <tr><td style="padding:4px 40px 4px 0;">Invoiced Amount</td><td style="text-align:right;">${totalInvoiced.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
              <tr><td style="padding:4px 40px 4px 0;color:#059669;">Amount Received</td><td style="text-align:right;color:#059669;">${totalReceived.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
              <tr><td style="padding:4px 40px 4px 0;color:#dc2626;">Credit Notes</td><td style="text-align:right;color:#dc2626;">${totalCredits.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="padding:8px 40px 4px 0;font-weight:900;color:${theme.primary};font-size:12px;">Balance Due</td>
                <td style="padding:8px 0 4px 0;text-align:right;font-weight:900;color:${theme.primary};font-size:12px;">${runningBalance.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
              </tr>
            </table>
          </div>
          <div style="text-align:right;">
            <p style="font-size:10px;font-weight:800;font-style:italic;color:${theme.accent};">Official Account Statement</p>
            <div style="margin-top:1.5rem;width:180px;border-bottom:2px solid ${theme.primary}30;"></div>
            <p style="margin-top:6px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;color:#94a3b8;">Authorized Signatory</p>
          </div>
        </div>
      ` : '';

      const notesHtml = bc.showNotes ? `
        <div style="margin-top:1.5rem;padding:12px 16px;background:#f8fafc;border-radius:8px;border-left:3px solid ${theme.accent};">
          <div id="editable-notes" contenteditable="true" style="font-size:9px;color:#64748b;line-height:1.6;">${this.state.notesContent}</div>
        </div>
      ` : '';

      // Date range display
      const dateRangeText = this.state.filterDateStart
        ? `${this.state.filterDateStart.toLocaleDateString()} — ${this.state.filterDateEnd?.toLocaleDateString() || 'Present'}`
        : 'All Transactions';

      html += `
        <div class="a4-page" id="pdf-content" data-client-name="${clientName}" data-stamp-mode="${this.state.stampMode}">
          ${bc.showHeader ? `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:3px solid ${theme.primary};">
            <div style="flex:1;">
              ${this.state.customLogo
                ? `<img src="${this.state.customLogo}" style="height:56px;margin-bottom:1rem;object-fit:contain;display:block;">`
                : `<div style="height:52px;width:140px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:1rem;font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Your Logo</div>`
              }
              <div style="font-size:18px;font-weight:900;color:${theme.primary};letter-spacing:-0.02em;">${orgName}</div>
              <div id="co-address" contenteditable="true" style="font-size:9px;margin-top:5px;line-height:1.7;outline:none;min-height:14px;color:${this.state.companyExtras.address ? '#374151' : '#cbd5e1'};" data-placeholder="Click to add address">${this.state.companyExtras.address || 'Click to add address'}</div>
              <div id="co-phone" contenteditable="true" style="font-size:9px;margin-top:2px;outline:none;min-height:14px;color:${this.state.companyExtras.phone ? '#374151' : '#cbd5e1'};" data-placeholder="Phone number">${this.state.companyExtras.phone || 'Phone number'}</div>
              <div id="co-email" contenteditable="true" style="font-size:9px;margin-top:2px;outline:none;min-height:14px;color:${this.state.companyExtras.email ? '#374151' : '#cbd5e1'};" data-placeholder="Email address">${this.state.companyExtras.email || 'Email address'}</div>
              <div id="co-website" contenteditable="true" style="font-size:9px;margin-top:2px;outline:none;min-height:14px;color:${this.state.companyExtras.website ? '#374151' : '#cbd5e1'};" data-placeholder="Website">${this.state.companyExtras.website || 'Website'}</div>
              <div id="co-reg" contenteditable="true" style="font-size:9px;margin-top:2px;outline:none;min-height:14px;color:${this.state.companyExtras.reg ? '#374151' : '#cbd5e1'};" data-placeholder="Reg / VAT number">${this.state.companyExtras.reg || 'Reg / VAT number'}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;width:180px;">
              <div style="font-size:36px;font-weight:900;color:${theme.primary};letter-spacing:-0.04em;line-height:1;">SOA</div>
              <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.2em;color:#94a3b8;margin-top:4px;">Statement of Accounts</div>
              <div style="margin-top:1rem;background:${theme.primary};color:white;border-radius:10px;padding:12px 14px;">
                <div style="font-size:8px;font-weight:700;opacity:0.8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Balance Due</div>
                <div style="font-size:20px;font-weight:900;letter-spacing:-0.02em;">${this.state.currency} ${runningBalance.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
              </div>
              <div style="margin-top:8px;font-size:8px;font-weight:700;color:#94a3b8;">Dated: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>
          ` : ''}

          ${bc.showCustomer ? `
          <div style="margin-bottom:1.5rem;display:flex;gap:2rem;align-items:flex-start;">
            <div style="flex:1;">
              <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;color:#94a3b8;margin-bottom:6px;">Account</div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <div style="font-size:16px;font-weight:900;color:${theme.primary};">${clientName}</div>
                ${this.state.stampMode !== 'none' ? this._renderStampTag() : ''}
              </div>
              ${customer.contact_id ? `<div style="font-size:8px;font-weight:700;color:#94a3b8;margin-top:3px;font-family:'DM Mono',monospace;letter-spacing:0.06em;">ID: ${customer.contact_id}</div>` : ''}
              ${customer.email ? `<div style="font-size:9px;color:#64748b;margin-top:2px;">${customer.email}</div>` : ''}
              ${customer.mobile || customer.phone ? `<div style="font-size:9px;color:#64748b;">${customer.mobile || customer.phone}</div>` : ''}
              ${(customer.billing_address && customer.billing_address.address) ? `<div style="font-size:9px;color:#64748b;margin-top:2px;">${customer.billing_address.address}${customer.billing_address.city ? ', '+customer.billing_address.city : ''}</div>` : ''}
            </div>
            <div>
              <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;color:#94a3b8;margin-bottom:6px;">Period</div>
              <div style="font-size:10px;font-weight:700;color:#1e293b;">${dateRangeText}</div>
            </div>
          </div>
          ` : ''}

          <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:1.5rem;${this.state.tableBorders ? 'border:1px solid #111;' : ''}">
            <thead>
              <tr style="background:${theme.primary};color:white;">
                <th style="padding:10px 8px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;width:82px;white-space:nowrap;${this.state.tableBorders ? 'border:1px solid rgba(255,255,255,0.2);' : ''}">Date</th>
                <th style="padding:10px 8px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;width:90px;white-space:nowrap;${this.state.tableBorders ? 'border:1px solid rgba(255,255,255,0.2);' : ''}">Transaction</th>
                <th style="padding:10px 8px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;${this.state.tableBorders ? 'border:1px solid rgba(255,255,255,0.2);' : ''}">Details</th>
                <th style="padding:10px 8px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;text-align:right;width:90px;white-space:nowrap;${this.state.tableBorders ? 'border:1px solid rgba(255,255,255,0.2);' : ''}">Amount</th>
                <th style="padding:10px 8px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;text-align:right;width:90px;white-space:nowrap;${this.state.tableBorders ? 'border:1px solid rgba(255,255,255,0.2);' : ''}">Payment</th>
                <th style="padding:10px 8px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;text-align:right;width:95px;white-space:nowrap;${this.state.tableBorders ? 'border:1px solid rgba(255,255,255,0.2);' : ''}">Balance</th>
              </tr>
            </thead>
            <tbody class="ledger-rows">${rowsHtml}</tbody>
          </table>

          ${summaryHtml}
          ${notesHtml}
          <div data-biz-tc-placeholder="1"></div>
        </div>
      `;
    });

    this.targets.renderArea.innerHTML = html;
    this._splitIntoA4Pages();

    const notesDiv = document.getElementById('editable-notes');
    if (notesDiv) {
      notesDiv.oninput = (e) => {
        this.state.notesContent = e.target.innerHTML;
        localStorage.setItem('biz_notes', this.state.notesContent);
      };
    }

    // Wire editable company extra fields
    ['co-address','co-phone','co-email','co-website','co-reg'].forEach(fieldId => {
      const el = document.getElementById(fieldId);
      if (el) {
        el.oninput = () => {
          const key = fieldId.replace('co-','');
          this.state.companyExtras[key] = el.innerText;
          localStorage.setItem('biz_company_extras', JSON.stringify(this.state.companyExtras));
        };
        // Clear placeholder style on focus
        el.onfocus = () => el.style.color = '#374151';
        el.onblur = () => { if (!el.innerText.trim()) el.style.color = '#cbd5e1'; };
      }
    });

    this.attachLedgerListeners();
  }

  // ─────────────────────────────────────────
  // COLLECT & SORT TRANSACTIONS
  // ─────────────────────────────────────────
  collectTransactions(id) {
    const txs = [];
    (this.state.dataStore.invoices[id]?.records || []).forEach(inv => {
      txs.push({ date: inv.date, type: 'Invoice', ref: inv.invoice_number, due_date: inv.due_date, amount: this.getEffectiveInvoiceTotal(inv), payment: 0, raw: inv, sortDate: new Date(inv.date) });
    });
    (this.state.dataStore.payments[id]?.records || []).forEach(pay => {
      txs.push({ date: pay.date, type: 'Payment Received', ref: pay.payment_number, amount: 0, payment: parseFloat(pay.amount) || 0, raw: pay, sortDate: new Date(pay.date) });
    });
    (this.state.dataStore.creditnotes[id]?.records || []).forEach(cn => {
      txs.push({ date: cn.date, type: 'Credit Note', ref: cn.creditnote_number, amount: 0, payment: parseFloat(cn.total) || 0, raw: cn, sortDate: new Date(cn.date) });
    });
    return txs;
  }

  applySortAndFilter(transactions, bc) {
    let txs = [...transactions];
    if (this.state.filterDateStart) {
      txs = txs.filter(t => t.sortDate >= this.state.filterDateStart && (!this.state.filterDateEnd || t.sortDate <= this.state.filterDateEnd));
    }
    if (bc.sortBy === 'date_desc') txs.sort((a, b) => b.sortDate - a.sortDate);
    else if (bc.sortBy === 'amount_desc') txs.sort((a, b) => (b.amount || b.payment) - (a.amount || a.payment));
    else txs.sort((a, b) => a.sortDate - b.sortDate);
    return txs;
  }

  // ─────────────────────────────────────────
  // LEDGER LISTENERS (editable cells)
  // ─────────────────────────────────────────
  attachLedgerListeners() {
    this.targets.renderArea.querySelectorAll('[contenteditable="true"]').forEach(cell => {
      cell.oninput = () => this.recalcLedger();
    });
  }

  recalcLedger() {
    const rows = this.targets.renderArea.querySelectorAll('.master-ledger-table tbody tr, .ledger-rows tr');
    let running = 0;
    rows.forEach((row, i) => {
      if (i === 0) {
        const v = row.cells[5]?.innerText?.replace(/,/g, '');
        running = parseFloat(v) || 0;
        return;
      }
      if (row.classList.contains('ledger-item-row')) {
        const amt = parseFloat(row.cells[3]?.innerText?.replace(/,/g, '')) || 0;
        const pay = parseFloat(row.cells[4]?.innerText?.replace(/,/g, '')) || 0;
        running += amt - pay;
        if (row.cells[5]) row.cells[5].innerText = running.toLocaleString(undefined, { minimumFractionDigits: 2 });
      }
    });
  }

  // ─────────────────────────────────────────
  // EXPLORER
  // ─────────────────────────────────────────
  renderExplorer() {
    const tabs = this.targets.explorerTabs;
    if (!tabs) return;
    tabs.innerHTML = '';
    const available = ['invoices', 'creditnotes', 'payments', 'estimates', 'salesorders'];
    available.forEach(mod => {
      const btn = document.createElement('button');
      btn.className = `exp-tab${this.state.explorerModule === mod ? ' active' : ''}`;
      btn.textContent = mod.replace('customerpayments', 'payments');
      btn.onclick = () => { this.state.explorerModule = mod; this.renderExplorer(); };
      tabs.appendChild(btn);
    });

    const storeKey = this.state.explorerModule === 'customerpayments' ? 'payments' : this.state.explorerModule;
    const moduleData = this.state.dataStore[storeKey] || {};
    const allRecords = [];
    Object.entries(moduleData).forEach(([cid, data]) => {
      (data.records || []).forEach(r => allRecords.push({ Customer: data.customerName, ...r }));
    });

    if (allRecords.length === 0) {
      this.targets.explorerThead.innerHTML = '';
      this.targets.explorerTbody.innerHTML = '<tr><td colspan="100" style="padding:3rem;text-align:center;color:#94a3b8;font-size:0.75rem;font-weight:700;">No data — select a customer first</td></tr>';
      return;
    }

    const headers = Object.keys(allRecords[0]).filter(k => typeof allRecords[0][k] !== 'object');
    this.targets.explorerThead.innerHTML = `<tr>${headers.map(h => `<th>${h.replace(/_/g, ' ')}</th>`).join('')}</tr>`;
    this.targets.explorerTbody.innerHTML = allRecords.map(row =>
      `<tr>${headers.map(h => `<td>${(row[h] !== null && row[h] !== undefined) ? row[h] : '—'}</td>`).join('')}</tr>`
    ).join('');
  }

  // ─────────────────────────────────────────
  // SETTINGS MODAL
  // ─────────────────────────────────────────
  applySettings() {
    this.state.activeModules.clear();
    this.inputs.moduleCheckboxes.forEach(cb => { if (cb.checked) this.state.activeModules.add(cb.value); });
    localStorage.setItem('active_modules', JSON.stringify(Array.from(this.state.activeModules)));
    this.views.settingsModal.classList.add('view-hidden');
    if (this.state.selectedCustomerIds.size > 0) {
      this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {}, estimates: {}, salesorders: {} };
      for (const id of this.state.selectedCustomerIds) this.syncCustomerData(id).then(() => this.updateUIVisuals());
    }
  }

  // ─────────────────────────────────────────
  // ORG SWITCH
  // ─────────────────────────────────────────
  async handleOrgSwitch(orgId) {
    this.showLoading(20, 'Switching project…');
    this.state.selectedOrgId = orgId;
    localStorage.setItem('zoho_selected_org_id', orgId);
    this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {}, estimates: {}, salesorders: {} };
    this.state.selectedCustomerIds.clear();
    this.state.customerFullDetails = {};
    try {
      await this.fetchOrganizationDetails();
      await this.fetchCustomers();
      this.updateUIVisuals();
    } catch (e) { this.log(`Error: ${e.message}`); }
    finally { this.hideLoading(); }
  }

  // ─────────────────────────────────────────
  // COLOR PICKER
  // ─────────────────────────────────────────
  renderColorPicker() {
    if (!this.targets.colorPicker) return;
    this.targets.colorPicker.innerHTML = '';
    this.state.colors.forEach(c => {
      const dot = document.createElement('div');
      dot.className = `color-dot${this.state.theme === c.name ? ' active' : ''}`;
      dot.style.background = c.primary;
      dot.title = c.name;
      dot.onclick = () => {
        this.state.theme = c.name;
        localStorage.setItem('biz_theme', c.name);
        this.renderColorPicker();
        this.renderStatementUI();
      };
      this.targets.colorPicker.appendChild(dot);
    });
  }

  // ─────────────────────────────────────────
  // LOGO
  // ─────────────────────────────────────────
  handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      this.state.customLogo = ev.target.result;
      localStorage.setItem('biz_logo', this.state.customLogo);
      this.renderStatementUI();
    };
    reader.readAsDataURL(file);
  }

  // ─────────────────────────────────────────
  // EMAIL COMPOSER
  // ─────────────────────────────────────────
  openEmailComposer() {
    const id = Array.from(this.state.selectedCustomerIds)[0];
    const customer = this.state.customerFullDetails[id] || {};
    const email = document.getElementById('email-to');
    const subject = document.getElementById('email-subject');
    const body = document.getElementById('email-body');
    if (email) email.value = customer.email || '';
    if (subject) subject.value = `Statement of Account — ${customer.contact_name || 'Customer'}`;
    if (body) body.value = `Dear ${customer.contact_name || 'Customer'},\n\nPlease find attached your Statement of Account.\n\nIf you have any queries, please do not hesitate to contact us.\n\nKind regards,\n${this.getOrgName()}`;
    this.views.emailModal.classList.remove('view-hidden');
  }

  copyEmailToClipboard() {
    const subject = document.getElementById('email-subject')?.value || '';
    const body = document.getElementById('email-body')?.value || '';
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    const btn = this.btns.copyEmail;
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000); }
  }

  // ─────────────────────────────────────────
  // ZOOM
  // ─────────────────────────────────────────
  setZoom(val) {
    this.state.zoom = Math.max(0.3, Math.min(2.5, val));
    const pages = this.targets.renderArea.querySelectorAll('.a4-page');
    pages.forEach(p => { p.style.transform = `scale(${this.state.zoom})`; });
  }

  autoFitZoom() {
    const area = this.views.areaLedger;
    if (!area) return;
    const w = area.clientWidth;
    const a4w = 210 * 3.7795;
    const fit = (w * 0.88) / a4w;
    this.setZoom(Math.min(fit, 1.0));
  }

  // ─────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────
  showLoading(pct, txt) {
    const lp   = document.getElementById('loading-progress');
    const lc   = document.getElementById('loading-container');
    const ov   = document.getElementById('loading-overlay');
    const ovt  = document.getElementById('loading-overlay-text');
    const fun  = document.getElementById('loading-fun-msg');
    const fill = document.getElementById('lo-progress-fill');
    const slowMsg = document.getElementById('loading-slow-msg');

    if (lp)   lp.style.width = '100%';          // ambient stripe full-width
    if (lc)   lc.setAttribute('data-active','1');
    if (fill) fill.style.width = `${pct}%`;
    if (ovt)  ovt.textContent = txt.toUpperCase();
    if (slowMsg) slowMsg.style.display = 'none'; // hide slow msg on each new call

    if (fun) {
      const msgs = [
        'Fetching your data from Zoho Books…',
        'Crunching the numbers like a pro…',
        'Balancing the ledger…',
        'Counting every invoice…',
        'Chasing those payments (virtually)…',
        'Running ledger calculations…',
        'Syncing with Zoho Books…',
        'Hang tight, almost there…',
        'Pulling statement data…',
        'Preparing your financial report…',
        'Making the books look beautiful…',
        'Reconciling transactions…',
      ];
      fun.textContent = msgs[Math.floor(Math.random() * msgs.length)];
    }

    // Show slow-load message after 4 seconds
    if (this._slowLoadTimer) clearTimeout(this._slowLoadTimer);
    this._slowLoadTimer = setTimeout(() => {
      const customerName = (() => {
        const id = Array.from(this.state.selectedCustomerIds)[0];
        if (id) {
          const c = this.state.customerFullDetails[id] || this.state.customers.find(c => c.contact_id === id);
          return c?.contact_name || c?.contact_name || null;
        }
        return null;
      })();
      if (slowMsg) {
        slowMsg.textContent = customerName
          ? `${customerName} has a lot of data so please give 10 - 20 seconds to load`
          : 'This customer has a lot of data so please give 10 - 20 seconds to load';
        slowMsg.style.display = 'block';
      }
    }, 4000);

    // Generate starfield on first show
    const stars = document.getElementById('lo-stars-container');
    if (stars && !stars.dataset.built) {
      stars.dataset.built = '1';
      let starsHtml = '';
      for (let i = 0; i < 80; i++) {
        const size = Math.random() * 2.5 + 0.5;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const dur = (Math.random() * 3 + 1.5).toFixed(1);
        const delay = (Math.random() * 4).toFixed(1);
        const minOp = (Math.random() * 0.04 + 0.02).toFixed(2);
        const maxOp = (Math.random() * 0.35 + 0.15).toFixed(2);
        starsHtml += `<div class="lo-star" style="width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--d:${dur}s;--delay:${delay}s;--min-op:${minOp};--max-op:${maxOp};"></div>`;
      }
      stars.innerHTML = starsHtml;
    }

    if (ov) ov.classList.add('visible');
    document.body.classList.add('app-loading');
    if (this.views.skeletonLoader) this.views.skeletonLoader.classList.remove('view-hidden');
    if (this.views.statementContainer) this.views.statementContainer.classList.add('view-hidden');
  }

  hideLoading() {
    const fill = document.getElementById('lo-progress-fill');
    if (fill) fill.style.width = '100%';
    // Short pause so user sees 100% before dismissing
    if (this._slowLoadTimer) { clearTimeout(this._slowLoadTimer); this._slowLoadTimer = null; }
    const slowMsg = document.getElementById('loading-slow-msg');
    if (slowMsg) slowMsg.style.display = 'none';
    setTimeout(() => {
      const lc  = document.getElementById('loading-container');
      const ov  = document.getElementById('loading-overlay');
      document.body.classList.remove('app-loading');
      if (lc) lc.removeAttribute('data-active');
      // Fade out overlay
      if (ov) {
        ov.style.transition = 'opacity 0.45s ease';
        ov.style.opacity = '0';
        setTimeout(() => {
          ov.classList.remove('visible');
          ov.style.opacity = '';
          ov.style.transition = '';
          if (fill) fill.style.width = '0%';
        }, 460);
      }
      if (this.views.skeletonLoader) this.views.skeletonLoader.classList.add('view-hidden');
      if (this.views.statementContainer) this.views.statementContainer.classList.remove('view-hidden');
    }, 500);
  }

  // ─────────────────────────────────────────
  // LOG
  // ─────────────────────────────────────────
  log(msg) { if (this.targets.log) this.targets.log.textContent = `SYS: ${msg.toUpperCase()}`; }
  showLandingError(msg) {
    const el = this.views.landingError;
    const txt = this.targets.errorText || document.getElementById('landing-error-text');
    if (el) el.classList.remove('view-hidden');
    if (txt) txt.textContent = msg;
  }

  // ─────────────────────────────────────────
  // STAMP RENDERING
  // ─────────────────────────────────────────
  // Big colored tag placed right after the client name
  _renderStampTag() {
    if (this.state.stampMode === 'none') return '';
    const sc = this.state.stampConfig;
    const isD = this.state.stampMode === 'draft';
    const col = isD ? (sc.draftColor || '#dc2626') : (sc.finalColor || '#059669');
    const txt = isD ? 'DRAFT BILL' : 'FINAL BILL';
    const bg  = isD ? 'rgba(220,38,38,0.09)' : 'rgba(5,150,105,0.09)';
    // Use inline-block (not flex) so html2canvas renders text correctly in PDF
    return `<span data-biz-stamp="1" style="
      display:inline-block;
      vertical-align:middle;
      padding:3px 12px 4px 12px;
      border-radius:4px;
      background:${bg};
      border:2px solid ${col};
      color:${col};
      font-size:11px;
      font-weight:900;
      letter-spacing:0.22em;
      font-family:Arial,sans-serif;
      text-transform:uppercase;
      user-select:none;
      white-space:nowrap;
      line-height:16px;
      box-sizing:border-box;
      flex-shrink:0;
    ">${txt}</span>`;
  }

  // Compact stamp for continuation pages header
  _renderContStamp() {
    if (this.state.stampMode === 'none') return '';
    const sc = this.state.stampConfig;
    const isD = this.state.stampMode === 'draft';
    const col = isD ? (sc.draftColor || '#dc2626') : (sc.finalColor || '#059669');
    const txt = isD ? 'DRAFT BILL' : 'FINAL BILL';
    const bg  = isD ? 'rgba(220,38,38,0.09)' : 'rgba(5,150,105,0.09)';
    return `<span data-biz-stamp="1" style="
      display:inline-block;vertical-align:middle;
      padding:2px 9px 3px 9px;border-radius:4px;
      background:${bg};border:1.5px solid ${col};
      color:${col};font-size:9px;font-weight:900;
      letter-spacing:0.2em;font-family:Arial,sans-serif;
      text-transform:uppercase;white-space:nowrap;
      line-height:13px;box-sizing:border-box;
    ">${txt}</span>`;
  }

  _renderTermsHtml(mode) {
    // mode: 'draft' | 'final' (defaults based on stampMode)
    const isDraft = (mode || this.state.stampMode) === 'draft';
    if (isDraft) {
      const tc = this.state.termsConfig;
      if (!tc.showOnDraft) return '';
      const tdc = this.state.termsDraftConfig;
      const lines = (this.state.termsDraftContent || '').split('\n').filter(l => l.trim());
      return `
        <div data-biz-tc="1" style="margin-top:1.5rem;padding:12px 16px;background:${tdc.bgColor};border-radius:8px;border:1px solid ${tdc.borderColor};page-break-inside:avoid;">
          ${tdc.showTitle ? `<div style="font-size:${tdc.titleFontSize || '9px'};font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:${tdc.color};margin-bottom:8px;">${tdc.titleText}</div>` : ''}
          <ol style="margin:0;padding-left:18px;font-size:${tdc.fontSize};color:${tdc.color};line-height:1.7;">
            ${lines.map(l => `<li>${l.replace(/^\d+\.\s*/, '')}</li>`).join('')}
          </ol>
        </div>`;
    } else {
      const tc = this.state.termsConfig;
      if (!tc.showOnFinal && tc.showOnFinal !== undefined) return '';
      const lines = (this.state.termsContent || '').split('\n').filter(l => l.trim());
      return `
        <div data-biz-tc="1" style="margin-top:1.5rem;padding:12px 16px;background:${tc.bgColor};border-radius:8px;border:1px solid ${tc.borderColor};page-break-inside:avoid;">
          ${tc.showTitle ? `<div style="font-size:${tc.titleFontSize};font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:${tc.color};margin-bottom:8px;">${tc.titleText}</div>` : ''}
          <ol style="margin:0;padding-left:18px;font-size:${tc.fontSize};color:${tc.color};line-height:1.7;">
            ${lines.map(l => `<li>${l.replace(/^\d+\.\s*/, '')}</li>`).join('')}
          </ol>
        </div>`;
    }
  }

  // ─────────────────────────────────────────
  // MULTI-PAGE A4 SPLITTING
  // ─────────────────────────────────────────
  _splitIntoA4Pages() {
    // Run once after layout settles; use a flag to prevent duplicate T&C injection
    this._splitDone = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._doSplit();
    }));
  }

  _doSplit() {
    // A4 usable content at 96dpi: (297mm - 20mm padding) * 3.7795px/mm ≈ 1054px
    const A4_H = 1054;
    const pages = Array.from(this.targets.renderArea.querySelectorAll('.a4-page'));
    let didSplit = false;

    pages.forEach(page => {
      page.style.overflow = 'visible';
      const naturalH = page.scrollHeight;
      if (naturalH <= A4_H * 1.04) return; // fits comfortably

      const tbody = page.querySelector('.ledger-rows');
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      if (!rows.length) return;

      const tableEl = tbody.closest('table');
      const theadEl = tableEl?.querySelector('thead');
      const preTableH = tableEl ? tableEl.offsetTop : 200;
      const theadH = theadEl ? theadEl.offsetHeight : 44;

      let pageH = preTableH + theadH;
      const pageChunks = [[]];

      rows.forEach(row => {
        const rh = Math.max(row.offsetHeight || 0, 24);
        if (pageH + rh > A4_H && pageChunks[pageChunks.length - 1].length > 0) {
          pageChunks.push([]);
          pageH = theadH;
        }
        pageChunks[pageChunks.length - 1].push(row);
        pageH += rh;
      });

      if (pageChunks.length <= 1) return;

      const theadHtml = theadEl?.outerHTML || '';
      const tableStyle = tableEl?.getAttribute('style') || '';
      const beforeTable = this._getContentBefore(page, tableEl);
      const afterTable  = this._getContentAfter(page, tableEl);
      const termsHtml   = this.state.stampMode !== 'none' ? this._renderTermsHtml() : '';
      const totalPages  = pageChunks.length;

      // Continuation page header: client name + stamp + page num
      const clientName = page.dataset?.clientName || '';
      const contStampHtml = this._renderContStamp();
      const theme = this.getTheme();

      let pagesHtml = '';
      pageChunks.forEach((chunk, pi) => {
        const isLast = pi === pageChunks.length - 1;
        const rowsHtml = chunk.map(r => r.outerHTML).join('');
        const pageNum  = pi + 1;
        const contHeader = pi > 0 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;padding-bottom:8px;border-bottom:3px solid ${theme.primary};">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="font-size:13px;font-weight:900;color:${theme.primary};">${clientName}</div>
              ${contStampHtml}
            </div>
            <div style="font-size:8px;font-weight:700;color:#94a3b8;text-align:right;">
              <div style="font-size:7px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:1px;">Statement of Accounts</div>
              PAGE ${pageNum} OF ${totalPages}
            </div>
          </div>` : '';
        pagesHtml += `
          <div class="a4-page" style="overflow:visible;">
            ${pi === 0 ? beforeTable : contHeader}
            <table style="${tableStyle}">${theadHtml}<tbody class="ledger-rows">${rowsHtml}</tbody></table>
            ${isLast ? afterTable : ''}
            ${isLast ? termsHtml  : ''}
          </div>`;
      });

      const wrapper = document.createElement('div');
      wrapper.innerHTML = pagesHtml;
      page.replaceWith(...wrapper.children);
      didSplit = true;
    });

    // For pages that didn't need splitting, inject T&C in place of placeholder
    if (!didSplit) {
      this.targets.renderArea.querySelectorAll('[data-biz-tc-placeholder]').forEach(ph => {
        const termsHtml = this.state.stampMode !== 'none' ? this._renderTermsHtml() : '';
        if (termsHtml) {
          const tcDiv = document.createElement('div');
          tcDiv.innerHTML = termsHtml;
          if (tcDiv.firstElementChild) ph.replaceWith(tcDiv.firstElementChild);
          else ph.remove();
        } else {
          ph.remove();
        }
      });
    }

    if (didSplit) setTimeout(() => this.autoFitZoom(), 80);
    else this.autoFitZoom();
  }

  _getContentBefore(page, tableEl) {
    let html = '';
    let el = page.firstElementChild;
    while (el && el !== tableEl) {
      if (!el.classList.contains('a4-stamp') && el !== tableEl) html += el.outerHTML;
      el = el.nextElementSibling;
    }
    return html;
  }

  _getContentAfter(page, tableEl) {
    let html = '';
    let el = tableEl.nextElementSibling;
    while (el) {
      // Skip T&C blocks (regenerated per-page), placeholders, and any legacy stamp divs
      const skip = el.hasAttribute('data-biz-tc') || el.hasAttribute('data-biz-stamp') || el.hasAttribute('data-biz-tc-placeholder');
      if (!skip) html += el.outerHTML;
      el = el.nextElementSibling;
    }
    return html;
  }

  // ─────────────────────────────────────────
  // EXCEL EXPORT — styled multi-sheet workbook
  // ─────────────────────────────────────────
  downloadExcel() {
    if (this.state.selectedCustomerIds.size === 0) { alert('No customer selected.'); return; }
    this.showLoading(80, 'Building spreadsheet…');

    try {
      const wb = XLSX.utils.book_new();
      const orgName = this.getOrgName();
      const cur = this.state.currency;

      this.state.selectedCustomerIds.forEach(id => {
        const customer = this.state.customerFullDetails[id] || {};
        const clientName = customer.contact_name || 'N/A';
        const openingBalance = this.getEffectiveOpeningBalance(id);

        // ── Build rows ──────────────────────────────────────
        const txs = this.collectTransactions(id);
        txs.sort((a, b) => a.sortDate - b.sortDate);

        let running = openingBalance;
        let totalInvoiced = 0, totalReceived = 0, totalCredits = 0;

        // Header rows (will be styled)
        const rows = [];

        // Title block
        rows.push([orgName]);
        rows.push(['Statement of Accounts']);
        rows.push([`Customer: ${clientName}`]);
        rows.push([`Generated: ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`]);
        rows.push([`Period: ${this.state.filterDateStart ? this.state.filterDateStart.toLocaleDateString() + ' – ' + (this.state.filterDateEnd?.toLocaleDateString() || 'Present') : 'All Transactions'}`]);
        rows.push([]); // spacer

        // Column headers
        rows.push(['Date', 'Transaction', 'Reference', 'Details', `Amount (${cur})`, `Payment (${cur})`, `Balance (${cur})`]);

        // Opening balance row
        rows.push([
          '—',
          'OPENING BALANCE',
          '—',
          'Balance Brought Forward',
          '',
          '',
          openingBalance
        ]);
        const dataStartRow = rows.length; // 1-based index of first data row

        txs.forEach(tx => {
          running += tx.amount - tx.payment;
          if (tx.amount > 0) totalInvoiced += tx.amount;
          if (tx.payment > 0) {
            if (tx.type === 'Credit Note') totalCredits += tx.payment;
            else totalReceived += tx.payment;
          }
          let details = '';
          if (tx.type !== 'Payment Received') {
            const cacheKey = tx.type === 'Invoice' ? tx.raw.invoice_id : tx.raw.creditnote_id;
            const det = this.state.invoiceDetailsCache[cacheKey];
            if (det?.line_items) {
              details = det.line_items.map(li => {
                const rate = this.getEffectiveRate(li, tx.date);
                return `${li.name} (${li.quantity} × ${rate.toFixed(2)})`;
              }).join('\n');
            }
          } else {
            details = `Ref: ${tx.ref}`;
          }
          rows.push([
            tx.date,
            tx.type.toUpperCase(),
            tx.ref,
            details,
            tx.amount || '',
            tx.payment || '',
            running
          ]);
        });

        rows.push([]); // spacer

        // Summary block
        rows.push(['ACCOUNT SUMMARY']);
        rows.push(['Opening Balance', '', '', '', '', '', openingBalance]);
        rows.push(['Total Invoiced',  '', '', '', '', '', totalInvoiced]);
        rows.push(['Amount Received', '', '', '', '', '', totalReceived]);
        rows.push(['Credit Notes',    '', '', '', '', '', totalCredits]);
        rows.push(['BALANCE DUE',     '', '', '', '', '', running]);
        rows.push([]);
        rows.push(['Terms & Conditions']);
        (this.state.termsContent || '').split('\n').filter(l => l.trim()).forEach(line => {
          rows.push([line.replace(/^\d+\.\s*/, '')]);
        });

        // ── Create worksheet ──────────────────────────────
        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Column widths
        ws['!cols'] = [
          { wch: 13 }, // Date
          { wch: 20 }, // Transaction
          { wch: 18 }, // Reference
          { wch: 55 }, // Details
          { wch: 16 }, // Amount
          { wch: 16 }, // Payment
          { wch: 16 }, // Balance
        ];

        // Row heights — title block taller
        ws['!rows'] = rows.map((r, i) => {
          if (i === 0) return { hpt: 28 };
          if (i === 1) return { hpt: 18 };
          if (i === 6) return { hpt: 22 }; // column header row
          return { hpt: 16 };
        });

        // ── Apply styles ──────────────────────────────────
        const styleCell = (addr, style) => {
          if (!ws[addr]) ws[addr] = { t: 's', v: '' };
          ws[addr].s = style;
        };

        const BLUE    = '1D4ED8';
        const LBLUE   = 'EFF6FF';
        const DBLUE   = '1E3A5F';
        const GREEN   = '059669';
        const LGREEN  = 'ECFDF5';
        const RED     = 'DC2626';
        const AMBER   = 'B45309';
        const GREY    = 'F1F5F9';
        const DGREY   = '475569';
        const WHITE   = 'FFFFFF';
        const BLACK   = '0F172A';

        const boldFont  = (sz, col) => ({ bold: true, sz: sz || 11, color: { rgb: col || BLACK } });
        const normFont  = (sz, col) => ({ bold: false, sz: sz || 10, color: { rgb: col || BLACK } });
        const monoFont  = (sz, col) => ({ bold: false, sz: sz || 9, name: 'Courier New', color: { rgb: col || BLACK } });
        const center    = { horizontal: 'center', vertical: 'center' };
        const left      = { horizontal: 'left',   vertical: 'center' };
        const right     = { horizontal: 'right',  vertical: 'center' };
        const wrapLeft  = { horizontal: 'left',   vertical: 'top', wrapText: true };
        const thinBorder = {
          top:    { style: 'thin', color: { rgb: 'CBD5E1' } },
          bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
          left:   { style: 'thin', color: { rgb: 'CBD5E1' } },
          right:  { style: 'thin', color: { rgb: 'CBD5E1' } },
        };

        const enc = XLSX.utils.encode_cell;

        // Row 0: org name title
        styleCell(enc({r:0,c:0}), { font: boldFont(16, DBLUE), fill: { fgColor: { rgb: WHITE } }, alignment: left });
        // Row 1: "Statement of Accounts"
        styleCell(enc({r:1,c:0}), { font: boldFont(10, DGREY), fill: { fgColor: { rgb: WHITE } }, alignment: left });
        // Rows 2–4: customer/date/period
        for (let r = 2; r <= 4; r++) {
          styleCell(enc({r,c:0}), { font: normFont(9, DGREY), fill: { fgColor: { rgb: WHITE } }, alignment: left });
        }

        // Row 6: column headers
        const headers = ['A','B','C','D','E','F','G'];
        headers.forEach((col, ci) => {
          const addr = col + '7';
          if (!ws[addr]) ws[addr] = { t: 's', v: '' };
          ws[addr].s = {
            font: boldFont(9, WHITE),
            fill: { fgColor: { rgb: BLUE } },
            alignment: ci >= 4 ? right : left,
            border: thinBorder,
          };
        });

        // Row 7: opening balance
        ['A','B','C','D','E','F','G'].forEach((col, ci) => {
          const addr = col + '8';
          if (!ws[addr]) ws[addr] = { t: 's', v: '' };
          ws[addr].s = {
            font: boldFont(9, BLUE),
            fill: { fgColor: { rgb: LBLUE } },
            alignment: ci >= 4 ? { ...right } : left,
            border: thinBorder,
          };
        });

        // Data rows: alternate shading
        const firstDataExcelRow = 9; // 1-based = row index 8 (0-based)
        const lastDataExcelRow  = firstDataExcelRow + txs.length - 1;
        txs.forEach((tx, i) => {
          const excelRow = firstDataExcelRow + i;
          const isEven = i % 2 === 0;
          const isPayment = tx.type === 'Payment Received';
          const isCredit  = tx.type === 'Credit Note';
          const rowFill = isPayment ? LGREEN : (isCredit ? 'FFF1F2' : (isEven ? WHITE : GREY));
          const amtCol  = isPayment || isCredit ? (isPayment ? GREEN : RED) : BLACK;

          ['A','B','C','D','E','F','G'].forEach((col, ci) => {
            const addr = col + excelRow;
            if (!ws[addr]) ws[addr] = { t: 's', v: '' };
            let font = ci === 3 ? normFont(8, DGREY) : normFont(9, ci >= 4 ? amtCol : BLACK);
            if (ci >= 4) font.bold = true;
            if (ci === 1) { font.bold = true; font.color = { rgb: isPayment ? GREEN : (isCredit ? RED : BLACK) }; }
            ws[addr].s = {
              font,
              fill: { fgColor: { rgb: rowFill } },
              alignment: ci === 3 ? wrapLeft : (ci >= 4 ? right : left),
              border: thinBorder,
            };
          });
        });

        // Summary block: find its row index
        const summaryStartIdx = rows.findIndex(r => r[0] === 'ACCOUNT SUMMARY');
        if (summaryStartIdx >= 0) {
          const summaryRows = ['Opening Balance','Total Invoiced','Amount Received','Credit Notes','BALANCE DUE'];
          summaryRows.forEach((label, si) => {
            const ri = summaryStartIdx + 1 + si;
            const isFinal = label === 'BALANCE DUE';
            const labelCol = label === 'Amount Received' ? GREEN : (label === 'Credit Notes' ? RED : (isFinal ? WHITE : BLACK));
            const fillCol  = isFinal ? BLUE : (si % 2 === 0 ? WHITE : GREY);
            styleCell(enc({r: ri, c: 0}), { font: boldFont(isFinal ? 11 : 9, isFinal ? WHITE : labelCol), fill: { fgColor: { rgb: fillCol } }, alignment: left });
            styleCell(enc({r: ri, c: 6}), { font: boldFont(isFinal ? 11 : 9, isFinal ? WHITE : labelCol), fill: { fgColor: { rgb: fillCol } }, alignment: right });
          });
          // "ACCOUNT SUMMARY" title
          styleCell(enc({r: summaryStartIdx, c: 0}), { font: boldFont(10, WHITE), fill: { fgColor: { rgb: DBLUE } }, alignment: left });
        }

        // Merge title cells across columns
        ws['!merges'] = [
          { s:{r:0,c:0}, e:{r:0,c:6} },
          { s:{r:1,c:0}, e:{r:1,c:6} },
          { s:{r:2,c:0}, e:{r:2,c:6} },
          { s:{r:3,c:0}, e:{r:3,c:6} },
          { s:{r:4,c:0}, e:{r:4,c:6} },
        ];

        // Number format for currency cells (cols E, F, G in data rows)
        const numFmt = `#,##0.00`;
        const applyNumFmt = (r, c) => {
          const addr = enc({r, c});
          if (ws[addr] && typeof ws[addr].v === 'number') {
            ws[addr].z = numFmt;
          }
        };
        rows.forEach((row, ri) => {
          [4, 5, 6].forEach(ci => {
            if (typeof row[ci] === 'number') applyNumFmt(ri, ci);
          });
        });

        const sheetName = clientName.replace(/[\/\\?*\[\]]/g, '').slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      const fname = `SOA_${orgName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(wb, fname, { cellStyles: true });
    } catch(err) {
      alert('Excel export failed: ' + err.message);
      console.error(err);
    } finally {
      this.hideLoading();
    }
  }

  // ─────────────────────────────────────────
  // PDF EXPORT (multi-page)
  // ─────────────────────────────────────────
  async downloadPDF() {
    const pages = this.targets.renderArea.querySelectorAll('.a4-page');
    if (!pages.length) { alert('Generate a statement first.'); return; }
    this.showLoading(80, 'Rendering PDF…');

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        const clone = pages[i].cloneNode(true);
        const ghost = document.createElement('div');
        ghost.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;z-index:-1;background:white;';
        clone.style.cssText = 'transform:none;margin:0;box-shadow:none;width:794px;overflow:visible;';
        ghost.appendChild(clone);
        document.body.appendChild(ghost);
        const canvas = await html2canvas(clone, { scale: 2, useCORS: true, logging: false, windowWidth: 794, width: 794 });
        document.body.removeChild(ghost);
        if (i > 0) pdf.addPage();
        const imgData = canvas.toDataURL('image/jpeg', 0.97);
        const imgH = (canvas.height * pw) / canvas.width;
        // If content taller than A4, scale to fit
        const scaleH = imgH > ph ? ph : imgH;
        pdf.addImage(imgData, 'JPEG', 0, 0, pw, scaleH);
      }
      const firstId = Array.from(this.state.selectedCustomerIds)[0];
      const custName = (this.state.customerFullDetails[firstId]?.contact_name || 'Customer').replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_');
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
      pdf.save(`SOA_${custName}_${dateStr}_${timeStr}.pdf`);
    } catch (err) { alert('PDF generation failed: ' + err.message); }
    finally { this.hideLoading(); }
  }

  // ─────────────────────────────────────────
  // IMAGE EXPORT (all pages stitched vertically)
  // ─────────────────────────────────────────
  async downloadImage() {
    const pages = this.targets.renderArea.querySelectorAll('.a4-page');
    if (!pages.length) { alert('Generate a statement first.'); return; }
    this.showLoading(80, 'Capturing image…');

    try {
      const canvases = [];
      for (let i = 0; i < pages.length; i++) {
        const clone = pages[i].cloneNode(true);
        const ghost = document.createElement('div');
        ghost.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;z-index:-1;background:white;';
        clone.style.cssText = 'transform:none;margin:0;box-shadow:none;width:794px;overflow:visible;';
        ghost.appendChild(clone);
        document.body.appendChild(ghost);
        const canvas = await html2canvas(clone, { scale: 2, useCORS: true, logging: false, windowWidth: 794, width: 794 });
        document.body.removeChild(ghost);
        canvases.push(canvas);
      }
      // Stitch vertically
      const totalH = canvases.reduce((s, c) => s + c.height, 0);
      const combined = document.createElement('canvas');
      combined.width = canvases[0].width;
      combined.height = totalH;
      const ctx = combined.getContext('2d');
      let y = 0;
      canvases.forEach(c => { ctx.drawImage(c, 0, y); y += c.height; });
      const a = document.createElement('a');
      a.download = `SOA_${new Date().toISOString().slice(0,10)}.png`;
      a.href = combined.toDataURL('image/png');
      a.click();
    } catch (err) { alert('Image capture failed: ' + err.message); }
    finally { this.hideLoading(); }
  }

}

window.app = new BizSensePro();