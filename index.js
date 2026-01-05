
/**
 * ZOHO LEDGER PRO - LIVE ITEM ENGINE
 * Features: Instant Sync, Multi-Customer Item Matrix, Auto-Date Calculation
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
      // dataStore holds already fetched item data to prevent redundant API hits
      dataStore: {}, 
      statementData: []
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
      customerList: document.getElementById('customer-list')
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
      dataRangeInfo: document.getElementById('data-range-info')
    };

    this.btns = {
      connect: document.getElementById('btn-connect'),
      saveConfig: document.getElementById('btn-save-config'),
      download: document.getElementById('btn-download-pdf'),
      logout: document.getElementById('btn-logout'),
      selectAll: document.getElementById('btn-select-all'),
      clearAll: document.getElementById('btn-clear-all'),
      openConfigLanding: document.getElementById('btn-open-config-landing'),
      closeConfig: document.getElementById('btn-close-config')
    };

    this.targets = {
      renderArea: document.getElementById('statement-render-target'),
      emptyState: document.getElementById('empty-state'),
      log: document.getElementById('log-message'),
      loadingText: document.getElementById('loading-text'),
      landingErrorText: document.getElementById('landing-error-text')
    };

    if (this.inputs.displayRedirect) {
      this.inputs.displayRedirect.innerText = window.location.origin + window.location.pathname;
    }

    // Default dates: Start of current year to Today
    const now = new Date();
    this.inputs.from.value = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    this.inputs.to.value = now.toISOString().split('T')[0];
  }

  bindEvents() {
    this.btns.connect.onclick = () => this.startAuth();
    this.btns.saveConfig.onclick = () => this.saveConfig();
    this.btns.openConfigLanding.onclick = () => this.toggleModal(true);
    this.btns.closeConfig.onclick = () => this.toggleModal(false);
    this.btns.logout.onclick = () => this.logout();
    this.btns.download.onclick = () => this.downloadPDF();
    
    this.btns.selectAll.onclick = () => this.toggleAllCustomers(true);
    this.btns.clearAll.onclick = () => this.toggleAllCustomers(false);

    this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
    
    this.inputs.orgSelect.onchange = (e) => {
      this.state.selectedOrgId = e.target.value;
      localStorage.setItem('zoho_selected_org_id', e.target.value);
      this.state.dataStore = {}; // Clear cache on org change
      this.fetchCustomers();
    };

    this.inputs.from.onchange = () => this.syncAllActiveCustomers();
    this.inputs.to.onchange = () => this.syncAllActiveCustomers();
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
  }

  startAuth() {
    if (!this.config.clientId) return this.toggleModal(true);
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ,ZohoBooks.fullaccess.READ";
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
      this.showLoading("Authenticating Session...");
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
    this.showLoading("Fetching Registry...");
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
      div.className = `flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all text-xs ${isSelected ? 'bg-indigo-500/10' : ''}`;
      div.innerHTML = `
        <div class="w-4 h-4 rounded border border-white/20 flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500' : ''}">
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
    } else {
      this.state.selectedCustomerIds.add(id);
      if (!this.state.dataStore[id]) {
        await this.syncCustomerData(id);
      }
    }
    this.renderCustomerList();
    this.recalculateAndRender();
  }

  async syncCustomerData(id) {
    const customer = this.state.customers.find(c => c.contact_id === id);
    this.showLoading(`Syncing: ${customer.contact_name}`);
    
    const from = this.inputs.from.value;
    const to = this.inputs.to.value;
    
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/invoices?customer_id=${id}&date_start=${from}&date_end=${to}&status=sent,overdue&organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      
      const items = [];
      if (res?.invoices?.length > 0) {
        for (const inv of res.invoices) {
          const detUrl = `https://www.zohoapis.${this.config.region}/books/v3/invoices/${inv.invoice_id}?organization_id=${this.state.selectedOrgId}`;
          const detail = await this.rawRequest(detUrl);
          
          if (detail?.invoice?.line_items) {
            detail.invoice.line_items.forEach(li => {
              items.push({
                itemName: li.name,
                qty: li.quantity,
                subTotal: li.item_total,
                invoiceNo: inv.invoice_number,
                invoiceDate: inv.date,
                dueDate: inv.due_date,
                balance: inv.balance
              });
            });
          }
        }
      }
      this.state.dataStore[id] = {
        customerName: customer.contact_name,
        items: items
      };
      this.log(`${customer.contact_name} synced.`);
    } catch (e) {
      this.log(`Error syncing ${customer.contact_name}: ${e.message}`);
    } finally {
      this.hideLoading();
    }
  }

  async syncAllActiveCustomers() {
    this.state.dataStore = {}; // Clear cache because dates changed
    for (const id of this.state.selectedCustomerIds) {
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
      this.state.dataStore = {};
      this.recalculateAndRender();
    }
    this.renderCustomerList();
  }

  recalculateAndRender() {
    this.state.statementData = [];
    let minDate = null;
    let maxDate = null;

    this.state.selectedCustomerIds.forEach(id => {
      const data = this.state.dataStore[id];
      if (data) {
        this.state.statementData.push(data);
        data.items.forEach(item => {
          const d = new Date(item.invoiceDate);
          if (!minDate || d < minDate) minDate = d;
          if (!maxDate || d > maxDate) maxDate = d;
        });
      }
    });

    if (minDate && maxDate) {
      this.inputs.dataRangeInfo.classList.remove('hidden');
      this.inputs.spanRange.innerText = `${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()}`;
    } else {
      this.inputs.dataRangeInfo.classList.add('hidden');
    }

    this.renderStatementUI();
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
              <h1 class="text-xl font-black uppercase tracking-tight">${activeOrg.name}</h1>
              <p class="text-[8px] font-black text-neutral-500 uppercase tracking-widest mt-1">Item-Level Outstanding Ledger</p>
           </div>
           <div class="text-right text-[7px] font-bold uppercase leading-tight text-neutral-600">
              <p>Period: ${this.inputs.from.value} to ${this.inputs.to.value}</p>
              <p>Generation: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
           </div>
        </header>

        <table class="w-full text-left border-collapse table-fixed">
          <thead>
            <tr class="border-b border-black text-[7px] font-black uppercase bg-neutral-50">
              <th class="py-1 px-1 w-[20px]">#</th>
              <th class="py-1 px-1 w-[160px]">Item Name</th>
              <th class="py-1 px-1 w-[40px] text-center">Quantity</th>
              <th class="py-1 px-1 w-[80px] text-right">Sub Total (BCY)</th>
              <th class="py-1 px-1 w-[60px] text-center">Invoice Number</th>
              <th class="py-1 px-1 w-[55px] text-center">Invoice Date</th>
              <th class="py-1 px-1 w-[55px] text-center">Due Date</th>
              <th class="py-1 px-1 w-[80px] text-right">Balance (BCY)</th>
            </tr>
          </thead>
          <tbody>
    `;

    let globalIndex = 1;
    this.state.statementData.forEach(cust => {
      // Customer Header Row
      html += `
        <tr class="customer-header-row">
          <td colspan="8" class="py-1.5 px-2 font-black text-[9px] uppercase">Customer Name: ${cust.customerName}</td>
        </tr>
      `;

      if (cust.items.length === 0) {
        html += `<tr><td colspan="8" class="py-4 text-center text-neutral-400 italic">No outstanding items found.</td></tr>`;
      }

      cust.items.forEach(item => {
        html += `
          <tr class="item-row">
            <td class="py-1 px-1 text-[7px] text-neutral-400 font-mono">${globalIndex++}</td>
            <td class="py-1 px-1 font-bold truncate" contenteditable="true" title="${item.itemName}">${item.itemName}</td>
            <td class="py-1 px-1 text-center" contenteditable="true">${item.qty}</td>
            <td class="py-1 px-1 text-right font-medium" contenteditable="true">${item.subTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td class="py-1 px-1 text-center font-mono text-[7px]" contenteditable="true">${item.invoiceNo}</td>
            <td class="py-1 px-1 text-center text-[7px]" contenteditable="true">${item.invoiceDate}</td>
            <td class="py-1 px-1 text-center text-[7px]" contenteditable="true">${item.dueDate}</td>
            <td class="py-1 px-1 text-right font-black" contenteditable="true">${item.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          </tr>
        `;
      });
    });

    html += `
          </tbody>
        </table>

        <footer class="mt-16 pt-6 border-t border-neutral-300 text-[6px] font-bold uppercase flex justify-between text-neutral-400">
           <div>Authorized Report Payload | All Cells Editable for Correction</div>
           <div class="flex items-center space-x-4">
              <span>Status: Outstanding Only</span>
              <span>Ref: LEDGER-${Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
           </div>
        </footer>
      </div>
    `;

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
      throw new Error(err.message || 'Zoho communication failure');
    }
    return res.json();
  }

  downloadPDF() {
    const el = document.getElementById('pdf-content');
    this.showLoading("Rasterizing PDF...");
    html2pdf().set({
      margin: 0,
      filename: `Statement_Export_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 3, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save().then(() => this.hideLoading());
  }

  showLoading(txt) {
    this.targets.loadingText.innerText = txt;
    this.views.loading.classList.remove('view-hidden');
  }

  hideLoading() {
    this.views.loading.classList.add('view-hidden');
  }

  log(m) {
    this.targets.log.innerText = `> ${m}`;
  }

  showLandingError(m) {
    this.targets.landingErrorText.innerText = m;
    this.views.landingError.classList.remove('view-hidden');
  }

  logout() {
    localStorage.clear();
    window.location.reload();
  }
}

new ZohoLedgerApp();
