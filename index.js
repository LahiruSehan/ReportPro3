
/**
 * ZOHO LEDGER PRO - ITEM-LEVEL MULTI-SYNTHESIZER
 * Author: World-Class Senior Frontend Engineer
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
      statementData: null
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
      displayRedirect: document.getElementById('display-redirect-uri')
    };

    this.btns = {
      connect: document.getElementById('btn-connect'),
      saveConfig: document.getElementById('btn-save-config'),
      fetch: document.getElementById('btn-fetch-statement'),
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

    const now = new Date();
    this.inputs.from.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    this.inputs.to.value = now.toISOString().split('T')[0];
  }

  bindEvents() {
    this.btns.connect.onclick = () => this.startAuth();
    this.btns.saveConfig.onclick = () => this.saveConfig();
    this.btns.openConfigLanding.onclick = () => this.toggleModal(true);
    this.btns.logout.onclick = () => this.logout();
    this.btns.fetch.onclick = () => this.generateMultiStatement();
    this.btns.download.onclick = () => this.downloadPDF();
    
    this.btns.selectAll.onclick = () => this.toggleAllCustomers(true);
    this.btns.clearAll.onclick = () => this.toggleAllCustomers(false);

    this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
    
    this.inputs.orgSelect.onchange = (e) => {
      this.state.selectedOrgId = e.target.value;
      localStorage.setItem('zoho_selected_org_id', e.target.value);
      this.fetchCustomers();
    };
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
      this.showLoading("Waking Data Handshake...");
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
    this.showLoading("Indexing Customer Registry...");
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/contacts?contact_type=customer&status=active&organization_id=${this.state.selectedOrgId}`;
      const res = await this.rawRequest(url);
      if (res && res.contacts) {
        this.state.customers = res.contacts;
        this.renderCustomerList();
        this.log("Registry Synced.");
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
      const div = document.createElement('div');
      div.className = `flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all text-xs ${this.state.selectedCustomerIds.has(c.contact_id) ? 'bg-indigo-500/10' : ''}`;
      div.innerHTML = `
        <div class="w-4 h-4 rounded border border-white/20 flex items-center justify-center ${this.state.selectedCustomerIds.has(c.contact_id) ? 'bg-indigo-500 border-indigo-500' : ''}">
          ${this.state.selectedCustomerIds.has(c.contact_id) ? '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : ''}
        </div>
        <span class="truncate font-medium">${c.contact_name}</span>
      `;
      div.onclick = () => {
        if (this.state.selectedCustomerIds.has(c.contact_id)) this.state.selectedCustomerIds.delete(c.contact_id);
        else this.state.selectedCustomerIds.add(c.contact_id);
        this.renderCustomerList();
      };
      this.views.customerList.appendChild(div);
    });
  }

  toggleAllCustomers(selected) {
    if (selected) {
      this.state.customers.forEach(c => this.state.selectedCustomerIds.add(c.contact_id));
    } else {
      this.state.selectedCustomerIds.clear();
    }
    this.renderCustomerList();
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

  async generateMultiStatement() {
    if (this.state.selectedCustomerIds.size === 0) return alert("Select at least one customer.");
    
    this.showLoading("Synthesizing Item Matrix...");
    this.log(`Aggregating data for ${this.state.selectedCustomerIds.size} customers...`);
    
    const combinedData = [];
    const from = this.inputs.from.value;
    const to = this.inputs.to.value;

    try {
      for (const cid of this.state.selectedCustomerIds) {
        const customer = this.state.customers.find(c => c.contact_id === cid);
        this.showLoading(`Processing: ${customer.contact_name}`);
        
        const invUrl = `https://www.zohoapis.${this.config.region}/books/v3/invoices?customer_id=${cid}&date_start=${from}&date_end=${to}&status=sent,overdue&organization_id=${this.state.selectedOrgId}`;
        const invList = await this.rawRequest(invUrl);
        
        if (invList?.invoices?.length > 0) {
          const itemsForCustomer = [];
          for (const inv of invList.invoices) {
            const detUrl = `https://www.zohoapis.${this.config.region}/books/v3/invoices/${inv.invoice_id}?organization_id=${this.state.selectedOrgId}`;
            const detail = await this.rawRequest(detUrl);
            
            if (detail?.invoice?.line_items) {
              detail.invoice.line_items.forEach(li => {
                itemsForCustomer.push({
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
          if (itemsForCustomer.length > 0) {
            combinedData.push({ customerName: customer.contact_name, items: itemsForCustomer });
          }
        }
      }

      this.state.statementData = combinedData;
      this.renderStatementUI();
      this.btns.download.disabled = false;
      this.targets.emptyState.classList.add('view-hidden');
    } catch (e) {
      alert(`Synthesis Error: ${e.message}`);
    } finally {
      this.hideLoading();
    }
  }

  renderStatementUI() {
    const data = this.state.statementData;
    const activeOrg = this.state.organizations.find(o => o.organization_id === this.state.selectedOrgId);
    
    let html = `
      <div class="statement-view" id="pdf-content">
        <header class="flex justify-between items-end border-b-2 border-black pb-4 mb-8">
           <div>
              <h1 class="text-2xl font-black uppercase tracking-tight">${activeOrg.name}</h1>
              <p class="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mt-1">Itemized Ledger Balance Statement</p>
           </div>
           <div class="text-right text-[8px] font-bold uppercase leading-tight">
              <p>Period Start: ${this.inputs.from.value}</p>
              <p>Period End: ${this.inputs.to.value}</p>
           </div>
        </header>

        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-black text-[8px] font-black uppercase bg-neutral-100">
              <th class="py-2 px-1">#</th>
              <th class="py-2 px-1">Item Name / Description</th>
              <th class="py-2 px-1 text-center">Qty</th>
              <th class="py-2 px-1 text-right">Sub Total (BCY)</th>
              <th class="py-2 px-1 text-center">Invoice #</th>
              <th class="py-2 px-1 text-center">Date</th>
              <th class="py-2 px-1 text-center">Due Date</th>
              <th class="py-2 px-1 text-right">Balance (BCY)</th>
            </tr>
          </thead>
          <tbody>
    `;

    let globalIndex = 1;
    data.forEach(cust => {
      // Customer Header Row
      html += `
        <tr class="customer-row">
          <td colspan="8" class="py-2 px-2 font-black text-[10px] uppercase">Customer Name: ${cust.customerName}</td>
        </tr>
      `;

      cust.items.forEach(item => {
        html += `
          <tr class="item-row border-b border-neutral-100">
            <td class="py-1.5 px-1 font-mono text-[8px] opacity-40">${globalIndex++}</td>
            <td class="py-1.5 px-1 font-bold" contenteditable="true">${item.itemName}</td>
            <td class="py-1.5 px-1 text-center" contenteditable="true">${item.qty}</td>
            <td class="py-1.5 px-1 text-right font-medium" contenteditable="true">${item.subTotal.toFixed(2)}</td>
            <td class="py-1.5 px-1 text-center text-[8px] font-mono" contenteditable="true">${item.invoiceNo}</td>
            <td class="py-1.5 px-1 text-center text-[8px]" contenteditable="true">${item.invoiceDate}</td>
            <td class="py-1.5 px-1 text-center text-[8px]" contenteditable="true">${item.dueDate}</td>
            <td class="py-1.5 px-1 text-right font-black" contenteditable="true">${item.balance.toFixed(2)}</td>
          </tr>
        `;
      });
    });

    html += `
          </tbody>
        </table>

        <footer class="mt-20 pt-8 border-t border-black opacity-20 text-[7px] font-bold uppercase flex justify-between">
           <div>Authorized Internal Record | System Generated: ${new Date().toLocaleString()}</div>
           <div>Ref: ${Math.random().toString(36).substr(2, 9).toUpperCase()}</div>
        </footer>
      </div>
    `;

    this.targets.renderArea.innerHTML = html;
  }

  downloadPDF() {
    const el = document.getElementById('pdf-content');
    this.showLoading("Compiling PDF Payload...");
    html2pdf().set({
      margin: 0,
      filename: `Bulk_Statement_${Date.now()}.pdf`,
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
