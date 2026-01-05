
/**
 * ZOHO STATEMENT PRO - STANDALONE ENGINE
 * Fixes CORS via transparent proxying.
 */

class ZohoStatementApp {
  constructor() {
    // Shared Proxy to bypass CORS on github.io
    this.proxyPrefix = "https://corsproxy.io/?";
    
    this.config = JSON.parse(localStorage.getItem('zoho_config')) || {
      clientId: '',
      region: 'com'
    };
    
    this.state = {
      accessToken: localStorage.getItem('zoho_access_token'),
      organizations: [],
      selectedOrgId: localStorage.getItem('zoho_selected_org_id'),
      customers: [],
      statementData: null,
      selectedCustomer: null
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
      landingError: document.getElementById('landing-error')
    };
    
    this.inputs = {
      customer: document.getElementById('select-customer'),
      organization: document.getElementById('select-organization'),
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
      openConfigLanding: document.getElementById('btn-open-config-landing'),
      closeConfig: document.getElementById('btn-close-config')
    };

    this.targets = {
      renderArea: document.getElementById('statement-render-target'),
      emptyState: document.getElementById('empty-state'),
      log: document.getElementById('status-log'),
      loadingText: document.getElementById('loading-text'),
      landingErrorText: document.getElementById('landing-error-text'),
      errorSuggestion: document.getElementById('error-suggestion')
    };

    if (this.inputs.displayRedirect) {
      this.inputs.displayRedirect.innerText = window.location.origin + window.location.pathname;
    }

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    this.inputs.from.value = firstDay;
    this.inputs.to.value = lastDay;
  }

  bindEvents() {
    this.btns.connect.onclick = () => this.startAuth();
    this.btns.saveConfig.onclick = () => this.saveConfig();
    this.btns.openConfigLanding.onclick = () => this.toggleModal(true);
    this.btns.closeConfig.onclick = () => this.toggleModal(false);
    this.btns.logout.onclick = () => this.logout();
    this.btns.fetch.onclick = () => this.generateStatement();
    this.btns.download.onclick = () => this.downloadPDF();

    this.inputs.customer.onchange = (e) => {
      this.state.selectedCustomer = this.state.customers.find(c => c.contact_id === e.target.value);
    };

    this.inputs.organization.onchange = (e) => {
      this.state.selectedOrgId = e.target.value;
      localStorage.setItem('zoho_selected_org_id', e.target.value);
      this.log(`Switched context to Org: ${e.target.value}`);
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
    this.config = {
      clientId: this.inputs.clientId.value.trim(),
      region: this.inputs.region.value
    };
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.toggleModal(false);
    this.log("Settings saved. Ready for synchronization.");
    this.hideError();
  }

  startAuth() {
    if (!this.config.clientId) {
      this.showError("Missing Client ID", "Go to Developer Settings and enter your Zoho Client ID.");
      this.toggleModal(true);
      return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ,ZohoBooks.fullaccess.READ";
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent`;
    
    this.log(`Initiating Zoho Secure Auth (${this.config.region})...`);
    window.location.href = authUrl;
  }

  handleOAuthCallback() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      if (token) {
        this.state.accessToken = token;
        localStorage.setItem('zoho_access_token', token);
        window.history.replaceState({}, document.title, window.location.pathname);
        this.log("Auth token verified. Probing organizations...");
      }
    }
  }

  async checkSession() {
    if (this.state.accessToken) {
      this.showLoading("Waking session...");
      const success = await this.discoverOrganizations();
      
      if (success) {
        this.views.landing.classList.add('view-hidden');
        this.views.dashboard.classList.remove('view-hidden');
        this.hideError();
        this.fetchCustomers();
      } else {
        this.hideLoading();
      }
    }
  }

  async discoverOrganizations() {
    try {
      this.log("Auto-discovering organizations...");
      const url = `https://www.zohoapis.${this.config.region}/books/v3/organizations`;
      const res = await this.rawRequest(url);
      
      if (res && res.organizations) {
        this.state.organizations = res.organizations;
        this.populateOrgSelect();
        
        if (!this.state.selectedOrgId && res.organizations.length > 0) {
          this.state.selectedOrgId = res.organizations[0].organization_id;
          localStorage.setItem('zoho_selected_org_id', this.state.selectedOrgId);
        }
        this.inputs.organization.value = this.state.selectedOrgId;
        return true;
      }
      return false;
    } catch (e) {
      this.showError(e.message, "This usually happens if your Client ID is wrong or your Zoho region (.eu, .in) doesn't match your Developer Settings.");
      return false;
    }
  }

  populateOrgSelect() {
    this.inputs.organization.innerHTML = '';
    this.state.organizations.forEach(org => {
      const opt = document.createElement('option');
      opt.value = org.organization_id;
      opt.innerText = org.name;
      this.inputs.organization.appendChild(opt);
    });
  }

  async fetchCustomers() {
    if (!this.state.selectedOrgId) return;
    this.showLoading("Syncing Customer Directory...");
    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/contacts?contact_type=customer&status=active&organization_id=${this.state.selectedOrgId}`;
      const custRes = await this.rawRequest(url);
      if (custRes && custRes.contacts) {
        this.state.customers = custRes.contacts;
        this.populateCustomerSelect();
        this.log(`Sync complete: ${this.state.customers.length} records retrieved.`);
      }
    } catch (e) {
      this.log(`Sync Error: ${e.message}`);
    } finally {
      this.hideLoading();
    }
  }

  populateCustomerSelect() {
    this.inputs.customer.innerHTML = '<option value="">Choose Customer...</option>';
    this.state.customers.sort((a,b) => a.contact_name.localeCompare(b.contact_name)).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.contact_id;
      opt.innerText = c.contact_name;
      this.inputs.customer.appendChild(opt);
    });
  }

  async rawRequest(url) {
    // Transparent Proxy Wrap
    const proxiedUrl = this.proxyPrefix + encodeURIComponent(url);
    
    try {
      const res = await fetch(proxiedUrl, {
        headers: { 
          'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (res.status === 401) throw new Error("Authentication Expired. Please sign in again.");
      if (res.status === 403) throw new Error("Permission Denied. Check your Client Scopes.");
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: `Zoho Error ${res.status}` }));
        throw new Error(err.message || "Failed to communicate with Zoho Books.");
      }
      return await res.json();
    } catch (err) {
      if (err.name === 'TypeError') {
        throw new Error("CORS Handshake Failed. Your browser might be blocking the proxy. Try disabling ad-blockers for this site.");
      }
      throw err;
    }
  }

  async generateStatement() {
    const customerId = this.inputs.customer.value;
    const from = this.inputs.from.value;
    const to = this.inputs.to.value;

    if (!customerId) return alert("Select a customer first.");
    
    this.showLoading("Mining Transaction Data...");
    this.log(`Synthesizing statement for ${this.state.selectedCustomer.contact_name}...`);

    try {
      const invUrl = `https://www.zohoapis.${this.config.region}/books/v3/invoices?customer_id=${customerId}&date_start=${from}&date_end=${to}&status=sent,overdue&organization_id=${this.state.selectedOrgId}`;
      const invListRes = await this.rawRequest(invUrl);
      
      if (!invListRes || !invListRes.invoices || !invListRes.invoices.length) {
        this.targets.renderArea.innerHTML = `<div class="p-32 text-center opacity-30 italic font-medium">No outstanding invoices found for the selected period.</div>`;
        this.btns.download.disabled = true;
        this.hideLoading();
        return;
      }

      const detailedInvoices = [];
      for (const inv of invListRes.invoices) {
        this.showLoading(`Expanding: ${inv.invoice_number}`);
        const detUrl = `https://www.zohoapis.${this.config.region}/books/v3/invoices/${inv.invoice_id}?organization_id=${this.state.selectedOrgId}`;
        const detail = await this.rawRequest(detUrl);
        if (detail && detail.invoice) detailedInvoices.push(detail.invoice);
      }

      this.state.statementData = detailedInvoices;
      this.renderStatementUI();
      this.btns.download.disabled = false;
      this.targets.emptyState.classList.add('view-hidden');
      this.log(`Success: Generated ledger with ${detailedInvoices.length} entries.`);
    } catch (e) {
      alert(e.message);
    } finally {
      this.hideLoading();
    }
  }

  renderStatementUI() {
    const invoices = this.state.statementData;
    const customer = this.state.selectedCustomer;
    const activeOrg = this.state.organizations.find(o => o.organization_id === this.state.selectedOrgId);
    const totalDue = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);
    const activeCols = Array.from(document.querySelectorAll('#column-toggles input:checked')).map(i => i.dataset.col);

    let html = `
      <div class="statement-view animate-in" id="pdf-content">
        <div class="flex justify-between items-start mb-12 pb-8 border-b-4 border-black">
          <div>
            <h1 class="text-4xl font-black uppercase tracking-tighter">${activeOrg.name}</h1>
            <p class="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.5em] mt-2">Outstanding Account Statement</p>
          </div>
          <div class="text-right">
            <p class="font-black text-[9px] uppercase text-neutral-400">Date Range</p>
            <p class="text-lg font-black">${this.inputs.from.value} to ${this.inputs.to.value}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-12 mb-12">
          <div>
            <h4 class="text-[9px] font-black uppercase text-neutral-300 mb-2">Statement For</h4>
            <p class="text-2xl font-black">${customer.contact_name}</p>
          </div>
          <div class="bg-neutral-50 p-6 border-l-4 border-black rounded-r-xl">
             <div class="flex justify-between items-center mb-1">
                <span class="text-[10px] font-black uppercase text-neutral-400">Total Outstanding</span>
                <span class="text-2xl font-black">$${totalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
             </div>
             <p class="text-[9px] text-neutral-500 font-bold italic">Calculated from ${invoices.length} active invoices</p>
          </div>
        </div>

        <div class="space-y-16">
          ${invoices.map(inv => `
            <div class="invoice-block">
              <div class="flex justify-between items-center bg-neutral-100 px-4 py-3 mb-4 rounded-lg">
                <div class="flex items-center space-x-6">
                  <div>
                    <span class="text-[8px] font-black uppercase text-neutral-400 block">Invoice #</span>
                    <span class="font-black text-base">${inv.invoice_number}</span>
                  </div>
                  <div>
                    <span class="text-[8px] font-black uppercase text-neutral-400 block">Date</span>
                    <span class="font-bold">${inv.date}</span>
                  </div>
                </div>
                <div class="text-right">
                   ${activeCols.includes('due_date') ? `<span class="mr-6"><span class="text-[8px] font-black uppercase text-neutral-400">Due:</span> <span class="font-bold">${inv.due_date}</span></span>` : ''}
                   ${activeCols.includes('status') ? `<span class="bg-black text-white px-3 py-1 rounded text-[9px] font-black uppercase">${inv.status}</span>` : ''}
                </div>
              </div>

              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b-2 border-black text-[9px] font-black uppercase tracking-widest">
                    ${activeCols.includes('sku') ? `<th class="py-3 w-32">SKU</th>` : ''}
                    <th class="py-3">Item Description</th>
                    <th class="py-3 text-right">Qty</th>
                    <th class="py-3 text-right">Rate</th>
                    <th class="py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-black/5 text-[11px]">
                  ${inv.line_items.map(item => `
                    <tr>
                      ${activeCols.includes('sku') ? `<td class="py-3 font-mono text-[9px] opacity-60">${item.sku || '---'}</td>` : ''}
                      <td class="py-3 font-bold">${item.name}</td>
                      <td class="py-3 text-right">${item.quantity}</td>
                      <td class="py-3 text-right">${item.rate.toFixed(2)}</td>
                      <td class="py-3 text-right font-black">${item.item_total.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr class="border-t-2 border-black font-black">
                    <td colspan="${activeCols.includes('sku') ? 4 : 3}" class="py-5 text-right text-[10px] uppercase opacity-40">Invoice Balance Due:</td>
                    <td class="py-5 text-right text-lg font-black">$${inv.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `).join('')}
        </div>

        <div class="mt-24 pt-10 border-t border-black/10 flex justify-between items-center opacity-30 italic">
           <div class="text-[8px] font-bold uppercase tracking-widest">Zoho Books Outstanding Engine | Generated for Internal Reference</div>
           <div class="text-[8px] font-bold uppercase">Run ID: #${new Date().getTime().toString().slice(-8)}</div>
        </div>
      </div>
    `;

    this.targets.renderArea.innerHTML = html;
  }

  downloadPDF() {
    const element = document.getElementById('pdf-content');
    const name = this.state.selectedCustomer.contact_name.replace(/\s+/g, '_');
    
    this.showLoading("Finalizing PDF Export...");
    html2pdf().set({
      margin: 0,
      filename: `Statement_${name}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 3, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save().then(() => this.hideLoading());
  }

  showLoading(text) {
    this.targets.loadingText.innerText = text || "Connecting...";
    this.views.loading.classList.remove('view-hidden');
  }

  hideLoading() {
    this.views.loading.classList.add('view-hidden');
  }

  showError(msg, suggestion) {
    this.targets.landingErrorText.innerText = msg;
    this.targets.errorSuggestion.innerText = suggestion || "Refresh the page and try again.";
    this.views.landingError.classList.remove('view-hidden');
  }

  hideError() {
    this.views.landingError.classList.add('view-hidden');
  }

  log(msg) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const div = document.createElement('div');
    div.className = "mb-1.5 border-l-2 border-indigo-500/20 pl-3";
    div.innerHTML = `<span class="text-neutral-700 font-bold">${time}</span> — ${msg}`;
    this.targets.log.prepend(div);
  }

  logout() {
    localStorage.removeItem('zoho_access_token');
    localStorage.removeItem('zoho_selected_org_id');
    window.location.reload();
  }
}

new ZohoStatementApp();
