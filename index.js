
/**
 * ZOHO OUTSTANDING STATEMENT ENGINE
 * Features: Auto-Org discovery, Live fetch, Outstanding-only filtering, A4 PDF synthesis.
 */

class ZohoStatementApp {
  constructor() {
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
      
      // Order is critical: Check URL first
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
      landingErrorText: document.getElementById('landing-error-text')
    };

    if (this.inputs.displayRedirect) {
      this.inputs.displayRedirect.innerText = window.location.origin + window.location.pathname;
    }

    // Set default dates (Current month)
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
      this.log(`Switched to Org ID: ${e.target.value}`);
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
    this.log("Developer configuration updated.");
    this.hideError();
  }

  startAuth() {
    if (!this.config.clientId) {
      this.showError("Client ID must be configured first.");
      this.toggleModal(true);
      return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    // Added organizations.READ to auto-discover account details
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ,ZohoBooks.fullaccess.READ";
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent`;
    
    this.log(`Redirecting to Zoho Identity Provider...`);
    window.location.href = authUrl;
  }

  handleOAuthCallback() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      const error = params.get('error');

      if (token) {
        this.state.accessToken = token;
        localStorage.setItem('zoho_access_token', token);
        window.history.replaceState({}, document.title, window.location.pathname);
        this.log("Access granted. Initializing environment...");
      } else if (error) {
        this.showError(`Zoho Auth Error: ${error}. Check your Client ID and Redirect URI.`);
        window.history.replaceState({}, document.title, window.location.pathname);
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
        // We do NOT clear token here unless it's a 401, because a "Failed to fetch" might just be a network error
        this.hideLoading();
      }
    }
  }

  async discoverOrganizations() {
    try {
      this.log("Fetching account organizations...");
      const res = await this.apiCallNoOrg('organizations');
      
      if (res && res.organizations) {
        this.state.organizations = res.organizations;
        this.populateOrgSelect();
        
        // Auto-select if not set
        if (!this.state.selectedOrgId && res.organizations.length > 0) {
          this.state.selectedOrgId = res.organizations[0].organization_id;
          localStorage.setItem('zoho_selected_org_id', this.state.selectedOrgId);
        }
        this.inputs.organization.value = this.state.selectedOrgId;
        return true;
      }
      return false;
    } catch (e) {
      if (e.message.includes("Expired") || e.message.includes("Unauthorized")) {
        this.logout(false);
      }
      this.showError(`Discovery Failed: ${e.message}`);
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
    this.showLoading("Syncing Customer Registry...");
    try {
      const custRes = await this.apiCall('contacts?contact_type=customer&status=active');
      if (custRes && custRes.contacts) {
        this.state.customers = custRes.contacts;
        this.populateCustomerSelect();
        this.log(`Ready: Found ${this.state.customers.length} active customers.`);
      }
    } catch (e) {
      this.log(`Sync Error: ${e.message}`);
    } finally {
      this.hideLoading();
    }
  }

  populateCustomerSelect() {
    this.inputs.customer.innerHTML = '<option value="">Select Customer...</option>';
    this.state.customers.sort((a,b) => a.contact_name.localeCompare(b.contact_name)).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.contact_id;
      opt.innerText = c.contact_name;
      this.inputs.customer.appendChild(opt);
    });
  }

  // API Call without requiring Org ID (for discovery)
  async apiCallNoOrg(endpoint) {
    const url = `https://www.zohoapis.${this.config.region}/books/v3/${endpoint}`;
    return this.rawRequest(url);
  }

  // Standard API Call
  async apiCall(endpoint) {
    if (!this.state.selectedOrgId) throw new Error("No organization selected.");
    const url = `https://www.zohoapis.${this.config.region}/books/v3/${endpoint}${endpoint.includes('?') ? '&' : '?'}organization_id=${this.state.selectedOrgId}`;
    return this.rawRequest(url);
  }

  async rawRequest(url) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}` }
      });
      
      if (res.status === 401) throw new Error("Session Expired. Please login again.");
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: `Request Failed (${res.status})` }));
        throw new Error(err.message || err.error_msg);
      }
      return await res.json();
    } catch (err) {
      if (err.name === 'TypeError') {
        throw new Error("Network Error/Blocked. Check your Region setting and Ad-blocker.");
      }
      throw err;
    }
  }

  async generateStatement() {
    const customerId = this.inputs.customer.value;
    const from = this.inputs.from.value;
    const to = this.inputs.to.value;

    if (!customerId) return alert("Please select a target customer.");
    
    this.showLoading("Generating Ledger...");
    this.log(`Fetching outstanding records for ${this.state.selectedCustomer.contact_name}...`);

    try {
      // Fetch Open and Overdue invoices
      const invListRes = await this.apiCall(`invoices?customer_id=${customerId}&date_start=${from}&date_end=${to}&status=sent,overdue`);
      
      if (!invListRes || !invListRes.invoices || !invListRes.invoices.length) {
        this.targets.renderArea.innerHTML = `<div class="p-20 text-center opacity-40 italic">No outstanding balance found for this period.</div>`;
        this.btns.download.disabled = true;
        this.hideLoading();
        return;
      }

      const detailedInvoices = [];
      for (const inv of invListRes.invoices) {
        this.showLoading(`Expanding: ${inv.invoice_number}`);
        const detail = await this.apiCall(`invoices/${inv.invoice_id}`);
        if (detail && detail.invoice) detailedInvoices.push(detail.invoice);
      }

      this.state.statementData = detailedInvoices;
      this.renderStatementUI();
      this.btns.download.disabled = false;
      this.targets.emptyState.classList.add('view-hidden');
      this.log(`Statement generated with ${detailedInvoices.length} invoices.`);
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
      <div class="statement-view animate-fade" id="pdf-content">
        <div class="flex justify-between items-start mb-10 pb-6 border-b-2 border-black">
          <div>
            <h1 class="text-3xl font-black uppercase tracking-tighter">${activeOrg.name}</h1>
            <p class="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.4em] mt-1">Outstanding Item Ledger</p>
          </div>
          <div class="text-right">
            <p class="font-bold">Period</p>
            <p class="text-neutral-600">${this.inputs.from.value} — ${this.inputs.to.value}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-10 mb-10">
          <div>
            <h4 class="text-[9px] font-black uppercase text-neutral-300 mb-2">Customer Identity</h4>
            <p class="text-lg font-black">${customer.contact_name}</p>
          </div>
          <div class="bg-neutral-50 p-4 border border-black/5 rounded">
             <div class="flex justify-between items-center mb-1">
                <span class="text-[9px] font-black uppercase text-neutral-400">Balance Due</span>
                <span class="text-xl font-black">$${totalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
             </div>
             <p class="text-[8px] text-neutral-500 uppercase font-bold">Aggregated Records: ${invoices.length}</p>
          </div>
        </div>

        <div class="space-y-12">
          ${invoices.map(inv => `
            <div class="invoice-block border-t border-black/10 pt-4">
              <div class="flex justify-between items-end bg-neutral-100 p-3 mb-4 rounded">
                <div>
                  <span class="text-[9px] font-black uppercase text-neutral-400">Invoice ID</span>
                  <p class="font-black text-sm">${inv.invoice_number}</p>
                </div>
                <div class="text-right text-[10px]">
                   <span class="font-bold">Date:</span> ${inv.date} 
                   ${activeCols.includes('due_date') ? `<span class="ml-4"><span class="font-bold">Due:</span> ${inv.due_date}</span>` : ''}
                   ${activeCols.includes('status') ? `<span class="ml-4 font-black text-indigo-600 uppercase">[${inv.status}]</span>` : ''}
                </div>
              </div>

              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b-2 border-black text-[9px] font-black uppercase">
                    ${activeCols.includes('sku') ? `<th class="py-2 w-24">SKU</th>` : ''}
                    <th class="py-2">Description</th>
                    <th class="py-2 text-right">Qty</th>
                    <th class="py-2 text-right">Rate</th>
                    <th class="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-black/5 text-[11px]">
                  ${inv.line_items.map(item => `
                    <tr>
                      ${activeCols.includes('sku') ? `<td class="py-2 font-mono text-[9px]">${item.sku || '---'}</td>` : ''}
                      <td class="py-2 font-medium">${item.name}</td>
                      <td class="py-2 text-right">${item.quantity}</td>
                      <td class="py-2 text-right">${item.rate.toFixed(2)}</td>
                      <td class="py-2 text-right font-medium">${item.item_total.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr class="border-t-2 border-black font-black">
                    <td colspan="${activeCols.includes('sku') ? 4 : 3}" class="py-4 text-right text-[10px] uppercase">Invoice Balance:</td>
                    <td class="py-4 text-right text-sm font-mono">$${inv.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `).join('')}
        </div>

        <div class="mt-20 pt-10 border-t border-black/10 flex justify-between items-center opacity-40">
           <div class="text-[8px] font-black uppercase tracking-widest">Zoho Books Insight Connector</div>
           <div class="text-[8px] font-medium uppercase tracking-tighter">Rendered on ${new Date().toLocaleString()}</div>
        </div>
      </div>
    `;

    this.targets.renderArea.innerHTML = html;
  }

  downloadPDF() {
    const element = document.getElementById('pdf-content');
    const filename = `Statement_${this.state.selectedCustomer.contact_name.replace(/\s+/g, '_')}.pdf`;
    
    this.showLoading("Synthesizing PDF...");
    html2pdf().set({
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
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

  showError(msg) {
    this.targets.landingErrorText.innerText = msg;
    this.views.landingError.classList.remove('view-hidden');
  }

  hideError() {
    this.views.landingError.classList.add('view-hidden');
  }

  log(msg) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const div = document.createElement('div');
    div.className = "mb-1 border-l-2 border-white/5 pl-2";
    div.innerHTML = `<span class="text-neutral-700 font-bold">${time}</span> ${msg}`;
    this.targets.log.prepend(div);
  }

  logout(reload = true) {
    localStorage.removeItem('zoho_access_token');
    localStorage.removeItem('zoho_selected_org_id');
    this.state.accessToken = null;
    if (reload) window.location.reload();
  }
}

new ZohoStatementApp();
