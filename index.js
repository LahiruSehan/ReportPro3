
/**
 * BIZSENSE STATEMENT PRO - NATIVE ZOHO SOA REPLICATION ENGINE
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
      loadingBar: document.getElementById('loading-bar-container'),
      loadingOverlay: document.getElementById('loading-status-overlay'),
      loadingProgress: document.getElementById('loading-bar'),
      loadingText: document.getElementById('loading-bar-text'),
      customerList: document.getElementById('customer-list'),
      areaLedger: document.getElementById('area-ledger'),
      statementContainer: document.getElementById('statement-render-target'),
      ledgerView: document.getElementById('view-ledger-container'),
      explorerView: document.getElementById('view-explorer-container'),
      pdfTemp: document.getElementById('pdf-export-temp'),
      emptyState: document.getElementById('empty-state')
    };
    
    this.inputs = {
      orgSelect: document.getElementById('select-organization'),
      search: document.getElementById('customer-search'),
      clientId: document.getElementById('cfg-client-id'),
      region: document.getElementById('cfg-region'),
      logoUpload: document.getElementById('logo-upload')
    };

    this.btns = {
      connect: document.getElementById('btn-connect'),
      saveConfig: document.getElementById('btn-save-config'),
      downloadPdf: document.getElementById('btn-download-pdf'),
      downloadExcel: document.getElementById('btn-download-excel'),
      logout: document.getElementById('btn-logout'),
      clearAll: document.getElementById('btn-clear-all'),
      zoomIn: document.getElementById('btn-zoom-in'),
      zoomOut: document.getElementById('btn-zoom-out'),
      zoomFit: document.getElementById('btn-zoom-fit'),
      toggleLedger: document.getElementById('btn-view-ledger'),
      toggleExplorer: document.getElementById('btn-view-explorer')
    };

    this.targets = {
      renderArea: document.getElementById('statement-render-target'),
      log: document.getElementById('log-message'),
      stats: document.getElementById('data-stats'),
      explorerTabs: document.getElementById('explorer-tabs'),
      explorerThead: document.getElementById('explorer-thead'),
      explorerTbody: document.getElementById('explorer-tbody')
    };
  }

  bindEvents() {
    this.btns.connect.onclick = () => this.startAuth();
    this.btns.saveConfig.onclick = () => this.saveConfig();
    this.btns.logout.onclick = () => this.logout();
    this.btns.downloadPdf.onclick = () => this.downloadPDF();
    this.btns.downloadExcel.onclick = () => this.downloadExcel();
    this.btns.clearAll.onclick = () => this.resetSelection();
    
    this.btns.toggleLedger.onclick = () => this.switchView('ledger');
    this.btns.toggleExplorer.onclick = () => this.switchView('explorer');

    this.btns.zoomIn.onclick = () => this.setZoom(this.state.zoom + 0.1);
    this.btns.zoomOut.onclick = () => this.setZoom(this.state.zoom - 0.1);
    this.btns.zoomFit.onclick = () => this.autoFitZoom();
    this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
    this.inputs.logoUpload.onchange = (e) => this.handleLogoUpload(e);
    this.inputs.orgSelect.onchange = (e) => this.handleOrgSwitch(e.target.value);
  }

  async handleOrgSwitch(orgId) {
    this.showLoading(20, "Switching Project...");
    this.state.selectedOrgId = orgId;
    localStorage.setItem('zoho_selected_org_id', orgId);
    
    this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {} };
    this.state.invoiceDetailsCache = {};
    this.state.selectedCustomerIds = new Set();
    this.state.customerFullDetails = {};

    await this.fetchOrganizationDetails();
    await this.fetchCustomers();
    this.renderCustomerList();
    this.updateUIVisuals();
    this.hideLoading();
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
      try {
        const success = await this.discoverOrganizations();
        if (success) {
          this.views.landing.classList.add('view-hidden');
          await this.fetchOrganizationDetails();
          await this.fetchCustomers();
        } else {
            this.views.landing.classList.remove('view-hidden');
        }
      } catch (err) {
        this.logout(false);
        this.views.landing.classList.remove('view-hidden');
      }
    } else {
        this.views.landing.classList.remove('view-hidden');
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
    } catch (e) { return false; }
  }

  async fetchOrganizationDetails() {
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/settings/organization?organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.organization) {
          this.state.currentOrgDetails = res.organization;
          this.state.currency = res.organization.currency_code || 'LKR';
      }
    } catch (e) { console.warn("Org detail fetch failed", e); }
  }

  async rawRequest(url) {
    const res = await fetch(this.proxyPrefix + encodeURIComponent(url), {
      headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`, 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (res.status === 401) throw new Error("Session Expired");
    if (!res.ok) throw new Error("API Connection Issue");
    return res.json();
  }

  startAuth() {
    if (!this.config.clientId) {
        this.views.configModal.classList.remove('view-hidden');
        return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.creditnotes.READ,ZohoBooks.customerpayments.READ,ZohoBooks.settings.READ";
    window.location.href = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent`;
  }

  async fetchCustomers() {
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/contacts?contact_type=customer&status=active&organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.contacts) {
        this.state.customers = res.contacts;
        this.renderCustomerList();
      }
    } catch (e) {}
  }

  renderCustomerList() {
    this.views.customerList.innerHTML = '';
    this.state.customers.sort((a,b) => a.contact_name.localeCompare(b.contact_name)).forEach(c => {
      const isSelected = this.state.selectedCustomerIds.has(c.contact_id);
      const div = document.createElement('div');
      div.className = `flex items-center space-x-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 group ${isSelected ? 'bg-indigo-500/10 border border-indigo-500/20' : 'border border-transparent'}`;
      div.innerHTML = `
        <div class="w-4 h-4 rounded border border-white/20 flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500' : ''}">
          ${isSelected ? '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
        </div>
        <span class="truncate font-black uppercase text-[9px] text-neutral-400 group-hover:text-white">${c.contact_name}</span>
      `;
      div.onclick = () => this.handleCustomerClick(c.contact_id);
      this.views.customerList.appendChild(div);
    });
  }

  async handleCustomerClick(id) {
    if (this.state.selectedCustomerIds.has(id)) {
      this.state.selectedCustomerIds.delete(id);
      delete this.state.dataStore.invoices[id];
      delete this.state.dataStore.creditnotes[id];
      delete this.state.dataStore.payments[id];
    } else {
      this.state.selectedCustomerIds.add(id);
      await this.syncCustomerData(id);
    }
    this.renderCustomerList();
    this.updateUIVisuals();
  }

  async syncCustomerData(id) {
    const customer = this.state.customers.find(c => c.contact_id === id);
    if (!customer) return;
    this.showLoading(50, `Syncing Statement: ${customer.contact_name}`);
    
    try {
        const cRes = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/contacts/${id}?organization_id=${this.state.selectedOrgId}`);
        this.state.customerFullDetails[id] = cRes.contact;
    } catch(e) {}

    const modules = ['invoices', 'creditnotes', 'customerpayments']; 
    for (const mod of modules) {
      try {
        const url = `https://www.zohoapis.${this.config.region}/books/v3/${mod}?customer_id=${id}&organization_id=${this.state.selectedOrgId}`;
        const res = await this.rawRequest(url);
        const key = mod === 'customerpayments' ? 'payments' : mod;
        this.state.dataStore[key][id] = { records: res[mod] || [] };
        
        if (mod !== 'customerpayments') {
            const idKey = mod === 'invoices' ? 'invoice_id' : 'creditnote_id';
            for (const r of this.state.dataStore[key][id].records) {
                const rid = r[idKey];
                if (!this.state.invoiceDetailsCache[rid]) {
                    const dRes = await this.rawRequest(`https://www.zohoapis.${this.config.region}/books/v3/${mod}/${rid}?organization_id=${this.state.selectedOrgId}`);
                    this.state.invoiceDetailsCache[rid] = dRes[mod.slice(0, -1)];
                }
            }
        }
      } catch (e) {}
    }
    this.hideLoading();
  }

  updateUIVisuals() {
    if (this.state.activeView === 'ledger') this.renderStatementUI();
    else this.renderExplorer();
    this.autoFitZoom();
  }

  renderStatementUI() {
    if (this.state.selectedCustomerIds.size === 0) {
      this.views.emptyState.classList.remove('view-hidden');
      this.targets.renderArea.innerHTML = '';
      this.btns.downloadPdf.disabled = this.btns.downloadExcel.disabled = true;
      return;
    }
    this.views.emptyState.classList.add('view-hidden');
    this.btns.downloadPdf.disabled = this.btns.downloadExcel.disabled = false;

    const org = this.state.currentOrgDetails || {};
    let finalHtml = '';

    this.state.selectedCustomerIds.forEach(id => {
      const customer = this.state.customerFullDetails[id] || {};
      const openingBalance = parseFloat(customer.opening_balance) || 0;
      let runningBalance = openingBalance;
      let totalInvoiced = 0;
      let totalReceived = 0;

      let txs = [];
      // 1. Invoices (Adding to balance)
      (this.state.dataStore.invoices[id]?.records || []).forEach(i => txs.push({ 
        date: i.date, type: 'Invoice', ref: i.invoice_number, due: i.due_date, amt: parseFloat(i.total), pay: 0, raw: i, sort: new Date(i.date) 
      }));
      // 2. Payments (Reducing balance)
      (this.state.dataStore.payments[id]?.records || []).forEach(p => txs.push({ 
        date: p.date, type: 'Payment Received', ref: p.payment_number, amt: 0, pay: parseFloat(p.amount), raw: p, sort: new Date(p.date) 
      }));
      // 3. Credit Notes (Reducing balance - Standard Zoho Behavior)
      (this.state.dataStore.creditnotes[id]?.records || []).forEach(c => txs.push({ 
        date: c.date, type: 'Credit Note', ref: c.creditnote_number, amt: 0, pay: parseFloat(c.total), raw: c, sort: new Date(c.date) 
      }));

      txs.sort((a,b) => a.sort - b.sort);

      // Opening Balance Row
      let rowsHtml = `
        <tr>
          <td></td>
          <td><b>OPENING BALANCE</b></td>
          <td>Balance brought forward</td>
          <td align="right"></td>
          <td align="right"></td>
          <td align="right"><b>${openingBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</b></td>
        </tr>
      `;

      txs.forEach(t => {
        runningBalance += t.amt;
        runningBalance -= t.pay;
        totalInvoiced += t.amt;
        totalReceived += t.pay;

        let details = '';
        if (t.type === 'Invoice') {
            const cache = this.state.invoiceDetailsCache[t.raw.invoice_id];
            details = `<div>Invoice ${t.ref} (Due: ${t.due})</div>`;
            if (cache?.line_items) cache.line_items.forEach(li => details += `<div style="padding-left:10px; font-size:9px; opacity:0.6">• ${li.name} × ${li.quantity}</div>`);
        } else if (t.type === 'Payment Received') {
            details = `<div>Payment Received</div><div style="font-size:9px; opacity:0.6">Ref: ${t.ref}</div>`;
        } else if (t.type === 'Credit Note') {
            const cache = this.state.invoiceDetailsCache[t.raw.creditnote_id];
            details = `<div>Credit Note ${t.ref}</div>`;
            if (cache?.line_items) cache.line_items.forEach(li => details += `<div style="padding-left:10px; font-size:9px; opacity:0.6">• ${li.name} × ${li.quantity}</div>`);
        }

        rowsHtml += `
          <tr>
            <td>${t.date}</td>
            <td><b>${t.type.toUpperCase()}</b></td>
            <td>${details}</td>
            <td align="right">${t.amt > 0 ? t.amt.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
            <td align="right">${t.pay > 0 ? t.pay.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</td>
            <td align="right"><b>${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</b></td>
          </tr>
        `;
      });

      finalHtml += `
        <div class="a4-page" id="pdf-content">
          <div style="display:flex; justify-content:space-between; margin-bottom:50px;">
            <div>
                ${this.state.customLogo ? `<img src="${this.state.customLogo}" style="height:55px; margin-bottom:15px;">` : `<div style="height:55px; font-weight:900; color:#cbd5e1; font-size:12px; margin-bottom:15px;">IDENTITY LOGO</div>`}
                <div style="font-size:11px; font-weight:700; color:#1f2937; margin-bottom:2px;">${org.name || 'Organization Name'}</div>
                <div style="font-size:9px; color:#6b7280; line-height:1.2;">${org.address || ''}</div>
            </div>
            <div style="text-align:right">
                <h1 style="font-size:22px; font-weight:700; color:#111827; margin:0 0 5px 0;">Statement of Accounts</h1>
                <div style="font-size:10px; color:#4b5563;">Period: Up to ${new Date().toLocaleDateString()}</div>
                <div style="font-size:10px; color:#4b5563;">Currency: ${this.state.currency}</div>
            </div>
          </div>

          <div style="margin-bottom:40px;">
            <div style="font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; margin-bottom:8px;">To:</div>
            <div style="font-size:14px; font-weight:800; color:#111827; margin-bottom:4px;">${customer.contact_name}</div>
            <div style="font-size:10px; color:#4b5563;">${customer.email || ''}</div>
          </div>

          <table class="soa-table">
            <thead>
              <tr>
                <th align="left" width="12%">Date</th>
                <th align="left" width="18%">Transactions</th>
                <th align="left" width="40%">Details</th>
                <th align="right" width="10%">Amount</th>
                <th align="right" width="10%">Payments</th>
                <th align="right" width="10%">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="summary-box">
            <div style="border-bottom:1px solid #d1d5db; padding-bottom:10px; margin-bottom:15px; font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase;">Account Summary</div>
            <div class="summary-row">
                <span>Opening Balance:</span>
                <span>${openingBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div class="summary-row">
                <span>Invoiced Amount:</span>
                <span>${totalInvoiced.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div class="summary-row">
                <span>Amount Received:</span>
                <span>${totalReceived.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div class="summary-row total">
                <span>Balance Due:</span>
                <span>${runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
          </div>
          
          <div style="margin-top:auto; padding-top:60px; text-align:right;">
            <p style="font-size:10px; color:#9ca3af; font-weight:600; text-transform:uppercase;">Authorized Signature</p>
            <div style="margin-top:40px; border-bottom:1px solid #d1d5db; width:180px; margin-left:auto;"></div>
          </div>
        </div>`;
    });

    this.targets.renderArea.innerHTML = finalHtml;
  }

  downloadPDF() {
    this.showLoading(85, "Capturing Native SOA PDF...");
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
      margin: [10, 10],
      filename: `SOA_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(tempContainer).save().then(() => {
      tempContainer.classList.add('view-hidden');
      tempContainer.style.display = 'none';
      this.hideLoading();
    });
  }

  downloadExcel() {
    this.showLoading(80, "Aggregating Excel SOA...");
    const data = [];
    this.state.selectedCustomerIds.forEach(id => {
      const customer = this.state.customerFullDetails[id] || {};
      const opening = parseFloat(customer.opening_balance) || 0;
      let balance = opening;
      data.push({ Date: '', Transactions: 'OPENING BALANCE', Details: 'Balance brought forward', Amount: '', Payments: '', Balance: opening });
      
      let txs = [];
      (this.state.dataStore.invoices[id]?.records || []).forEach(i => txs.push({ date: i.date, type: 'Invoice', ref: i.invoice_number, amt: parseFloat(i.total), pay: 0, sort: new Date(i.date) }));
      (this.state.dataStore.payments[id]?.records || []).forEach(p => txs.push({ date: p.date, type: 'Payment Received', ref: p.payment_number, amt: 0, pay: parseFloat(p.amount), sort: new Date(p.date) }));
      (this.state.dataStore.creditnotes[id]?.records || []).forEach(c => txs.push({ date: c.date, type: 'Credit Note', ref: c.creditnote_number, amt: 0, pay: parseFloat(c.total), sort: new Date(c.date) }));
      
      txs.sort((a,b) => a.sort - b.sort).forEach(t => {
        balance += t.amt;
        balance -= t.pay;
        data.push({ Date: t.date, Transactions: t.type, Details: t.ref, Amount: t.amt || '', Payments: t.pay || '', Balance: balance });
      });
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement_SOA");
    XLSX.writeFile(wb, `SOA_${Date.now()}.xlsx`);
    this.hideLoading();
  }

  setZoom(val) {
    this.state.zoom = Math.max(0.1, Math.min(3.0, val));
    const pages = this.targets.renderArea.querySelectorAll('.a4-page');
    pages.forEach(p => p.style.transform = `scale(${this.state.zoom})`);
    const standardA4H_px = 29.7 * 37.8;
    this.targets.renderArea.style.height = `${(pages[0]?.scrollHeight || standardA4H_px) * this.state.zoom + 200}px`;
  }

  autoFitZoom() {
    if(!this.views.areaLedger) return;
    const targetW = this.views.areaLedger.clientWidth * 0.85;
    this.setZoom(targetW / (21 * 37.8));
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

  resetSelection() {
      this.state.selectedCustomerIds.clear();
      this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {} };
      this.renderCustomerList();
      this.updateUIVisuals();
  }

  logout(reload = true) {
    localStorage.removeItem('zoho_access_token');
    localStorage.removeItem('zoho_selected_org_id');
    if(reload) window.location.reload();
  }

  saveConfig() {
    this.config = { clientId: document.getElementById('cfg-client-id').value.trim(), region: document.getElementById('cfg-region').value };
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.views.configModal.classList.add('view-hidden');
    this.updateConfigStatus();
  }

  updateConfigStatus() {
    this.btns.connect.disabled = !(this.config.clientId && this.config.clientId.length > 5);
  }

  renderExplorer() {
    this.targets.explorerTabs.innerHTML = '';
    ['invoices', 'creditnotes', 'payments'].forEach(mod => {
      const btn = document.createElement('button');
      btn.className = `px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${this.state.explorerModule === mod ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/5 text-neutral-500'}`;
      btn.innerText = mod;
      btn.onclick = () => { this.state.explorerModule = mod; this.renderExplorer(); };
      this.targets.explorerTabs.appendChild(btn);
    });

    const moduleData = this.state.dataStore[this.state.explorerModule];
    const allRecords = [];
    Object.entries(moduleData || {}).forEach(([cid, data]) => {
      data.records.forEach(r => allRecords.push({ ...r, _customer: this.state.customers.find(c => c.contact_id === cid)?.contact_name }));
    });

    if (allRecords.length === 0) {
      this.targets.explorerThead.innerHTML = '';
      this.targets.explorerTbody.innerHTML = '<tr><td colspan="100" class="py-20 text-center text-neutral-600 font-black text-[10px]">Registry Empty</td></tr>';
      return;
    }

    const headers = ['_customer', ...Object.keys(allRecords[0]).filter(k => k !== '_customer' && typeof allRecords[0][k] !== 'object')];
    this.targets.explorerThead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    this.targets.explorerTbody.innerHTML = allRecords.map(row => `<tr>${headers.map(h => `<td>${row[h] || '---'}</td>`).join('')}</tr>`).join('');
  }
}

window.app = new ZohoLedgerApp();
