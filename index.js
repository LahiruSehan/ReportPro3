
/**
 * ZOHO OUTSTANDING STATEMENT ENGINE
 * Features: Live fetch, Outstanding-only filtering, Item-level breakdown, A4 PDF synthesis.
 */

class ZohoStatementApp {
  constructor() {
    this.config = JSON.parse(localStorage.getItem('zoho_config')) || {
      clientId: '',
      orgId: '',
      region: 'com'
    };
    
    this.state = {
      accessToken: localStorage.getItem('zoho_access_token'),
      org: null,
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
      
      // Order is critical: Check URL first, then existing session
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
      from: document.getElementById('date-from'),
      to: document.getElementById('date-to'),
      clientId: document.getElementById('cfg-client-id'),
      orgId: document.getElementById('cfg-org-id'),
      region: document.getElementById('cfg-region')
    };

    this.btns = {
      connect: document.getElementById('btn-connect'),
      saveConfig: document.getElementById('btn-save-config'),
      fetch: document.getElementById('btn-fetch-statement'),
      download: document.getElementById('btn-download-pdf'),
      logout: document.getElementById('btn-logout'),
      showConfig: document.getElementById('btn-show-config'),
      openConfigLanding: document.getElementById('btn-open-config-landing'),
      closeConfig: document.getElementById('btn-close-config')
    };

    this.targets = {
      renderArea: document.getElementById('statement-render-target'),
      emptyState: document.getElementById('empty-state'),
      orgName: document.getElementById('header-org-name'),
      log: document.getElementById('status-log'),
      loadingText: document.getElementById('loading-text'),
      landingErrorText: document.getElementById('landing-error-text')
    };

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
    this.btns.showConfig.onclick = () => this.toggleModal(true);
    this.btns.closeConfig.onclick = () => this.toggleModal(false);
    this.btns.logout.onclick = () => this.logout();
    this.btns.fetch.onclick = () => this.generateStatement();
    this.btns.download.onclick = () => this.downloadPDF();

    this.inputs.customer.onchange = (e) => {
      this.state.selectedCustomer = this.state.customers.find(c => c.contact_id === e.target.value);
    };
  }

  toggleModal(show) {
    this.views.configModal.classList.toggle('view-hidden', !show);
    if (show) {
      this.inputs.clientId.value = this.config.clientId;
      this.inputs.orgId.value = this.config.orgId;
      this.inputs.region.value = this.config.region;
    }
  }

  saveConfig() {
    this.config = {
      clientId: this.inputs.clientId.value.trim(),
      orgId: this.inputs.orgId.value.trim(),
      region: this.inputs.region.value
    };
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.toggleModal(false);
    this.log("Config updated. Handshake will be re-attempted on next action.");
    this.hideError();
  }

  startAuth() {
    if (!this.config.clientId || !this.config.orgId) {
      this.showError("Client ID and Organization ID must be set in Connection Settings before authorization.");
      this.toggleModal(true);
      return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ";
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent`;
    
    this.log(`Redirecting to Zoho Identity Provider (${this.config.region})...`);
    window.location.href = authUrl;
  }

  handleOAuthCallback() {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      const error = params.get('error');

      if (token) {
        this.state.accessToken = token;
        localStorage.setItem('zoho_access_token', token);
        // Clear hash so page reload doesn't trigger this again
        window.history.replaceState({}, document.title, window.location.pathname);
        this.log("OAuth token parsed successfully.");
      } else if (error) {
        this.log(`OAuth Callback Error: ${error}`);
        this.showError(`Zoho denied access: ${error}. Ensure your Client ID and Redirect URI match exactly in the Zoho API Console.`);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }

  async checkSession() {
    if (this.state.accessToken) {
      if (!this.config.orgId || !this.config.clientId) {
        this.log("Incomplete configuration detected.");
        this.toggleModal(true);
        return;
      }
      
      this.showLoading("Verifying Zoho Link...");
      const success = await this.fetchInitialData();
      
      if (success) {
        this.views.landing.classList.add('view-hidden');
        this.views.dashboard.classList.remove('view-hidden');
        this.hideError();
      } else {
        // Handshake failed, clear token but stay on landing to show error
        this.log("Data handshake failed. Check Organization ID and Region.");
        localStorage.removeItem('zoho_access_token');
        this.state.accessToken = null;
      }
      this.hideLoading();
    }
  }

  async fetchInitialData() {
    try {
      this.log(`Probing Organization profile [${this.config.orgId}]...`);
      
      const orgRes = await this.apiCall('settings/orgprofile');
      if (orgRes && orgRes.organization) {
        this.state.org = orgRes.organization;
        this.targets.orgName.innerText = this.state.org.name;
        this.log(`Connected to: ${this.state.org.name}`);
      } else {
        throw new Error("Invalid profile response from Zoho.");
      }

      this.log(`Syncing active customer registry...`);
      const custRes = await this.apiCall('contacts?contact_type=customer&status=active');
      if (custRes && custRes.contacts) {
        this.state.customers = custRes.contacts;
        this.populateCustomerSelect();
        this.log(`Retrieved ${this.state.customers.length} customers.`);
      }
      return true;
    } catch (e) {
      let msg = e.message;
      if (msg.includes("Organization")) msg = "Invalid Organization ID or Cross-Region mismatch. Check if your account is on .com, .eu, or .in.";
      this.showError(msg);
      return false;
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

  async apiCall(endpoint) {
    const url = `https://www.zohoapis.${this.config.region}/books/v3/${endpoint}${endpoint.includes('?') ? '&' : '?'}organization_id=${this.config.orgId}`;
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}` }
      });
      
      if (res.status === 401) {
        throw new Error("Access Token is invalid or expired. Please re-authorize.");
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'API Request Failed' }));
        // Extract Zoho specific error message if available
        const zohoMsg = errorData.message || errorData.error_msg || `Server Error ${res.status}`;
        throw new Error(zohoMsg);
      }
      
      return await res.json();
    } catch (err) {
      console.error("API Call Error:", err);
      throw err;
    }
  }

  async generateStatement() {
    const customerId = this.inputs.customer.value;
    const from = this.inputs.from.value;
    const to = this.inputs.to.value;

    if (!customerId) return alert("Select a customer first.");
    if (!from || !to) return alert("Select a valid date range.");

    this.showLoading("Synthesizing Ledger...");
    this.log(`Aggregating data for ${this.state.selectedCustomer.contact_name}...`);

    try {
      // Fetch only Sent (Open) and Overdue invoices
      const invListRes = await this.apiCall(`invoices?customer_id=${customerId}&date_start=${from}&date_end=${to}&status=sent,overdue`);
      
      if (!invListRes || !invListRes.invoices || !invListRes.invoices.length) {
        this.targets.renderArea.innerHTML = `
          <div class="p-20 text-center space-y-4">
            <div class="text-neutral-500 italic">No outstanding invoices found for the period:</div>
            <div class="text-xs font-mono text-neutral-400">${from} to ${to}</div>
          </div>
        `;
        this.btns.download.disabled = true;
        this.log("No outstanding balances found.");
        this.hideLoading();
        return;
      }

      const detailedInvoices = [];
      for (const inv of invListRes.invoices) {
        this.showLoading(`Expanding Line Items: ${inv.invoice_number}`);
        const detail = await this.apiCall(`invoices/${inv.invoice_id}`);
        if (detail && detail.invoice) detailedInvoices.push(detail.invoice);
      }

      this.state.statementData = detailedInvoices;
      this.renderStatementUI();
      this.btns.download.disabled = false;
      this.targets.emptyState.classList.add('view-hidden');
      this.log(`Mapped ${detailedInvoices.length} outstanding invoices.`);
    } catch (e) {
      this.log(`Error: ${e.message}`);
      alert(`Statement Generation Failed: ${e.message}`);
    } finally {
      this.hideLoading();
    }
  }

  renderStatementUI() {
    const invoices = this.state.statementData;
    const org = this.state.org;
    const customer = this.state.selectedCustomer;
    const totalDue = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);
    const activeCols = Array.from(document.querySelectorAll('#column-toggles input:checked')).map(i => i.dataset.col);

    let html = `
      <div class="statement-view animate-fade" id="pdf-content">
        <!-- Header -->
        <div class="flex justify-between items-start mb-10 pb-6 border-b-2 border-black">
          <div>
            <h1 class="text-3xl font-black uppercase tracking-tighter">${org.name}</h1>
            <p class="text-[10px] text-neutral-600 uppercase font-bold tracking-widest mt-1">Outstanding Itemized Statement</p>
          </div>
          <div class="text-right">
            <p class="font-bold">Period</p>
            <p class="text-neutral-600">${this.inputs.from.value} — ${this.inputs.to.value}</p>
          </div>
        </div>

        <!-- Meta Grid -->
        <div class="grid grid-cols-2 gap-10 mb-10">
          <div>
            <h4 class="text-[9px] font-black uppercase text-neutral-400 mb-2">Billed To:</h4>
            <p class="text-lg font-black">${customer.contact_name}</p>
          </div>
          <div class="bg-neutral-50 p-4 border border-black/5">
             <div class="flex justify-between items-center mb-1">
                <span class="text-[9px] font-black uppercase text-neutral-400">Net Balance Due</span>
                <span class="text-xl font-black">$${totalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
             </div>
             <p class="text-[8px] text-neutral-500 uppercase tracking-widest font-bold">Consolidated from ${invoices.length} invoices</p>
          </div>
        </div>

        <!-- Invoice Breakdown -->
        <div class="space-y-12">
          ${invoices.map(inv => `
            <div class="invoice-block border-t border-black/10 pt-4">
              <div class="flex justify-between items-end bg-neutral-100 p-3 mb-2 rounded">
                <div>
                  <span class="text-[9px] font-black uppercase text-neutral-400">Invoice Ref</span>
                  <p class="font-black text-sm">${inv.invoice_number}</p>
                </div>
                <div class="text-right">
                   <div class="flex space-x-4 text-[10px]">
                      <div><span class="font-bold">Date:</span> ${inv.date}</div>
                      ${activeCols.includes('due_date') ? `<div><span class="font-bold">Due:</span> ${inv.due_date}</div>` : ''}
                      ${activeCols.includes('status') ? `<div class="uppercase font-black text-indigo-600">[${inv.status.replace(/_/g, ' ')}]</div>` : ''}
                   </div>
                </div>
              </div>

              <table class="w-full text-left border-collapse mt-4">
                <thead>
                  <tr class="border-b-2 border-black text-[9px] font-black uppercase">
                    ${activeCols.includes('sku') ? `<th class="py-2 w-24">SKU/Code</th>` : ''}
                    <th class="py-2">Item Detail</th>
                    <th class="py-2 text-right">Qty</th>
                    <th class="py-2 text-right">Rate</th>
                    <th class="py-2 text-right">Total</th>
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
                    <td colspan="${activeCols.includes('sku') ? 4 : 3}" class="py-4 text-right text-[10px] uppercase tracking-wider">Invoice Ledger Balance:</td>
                    <td class="py-4 text-right text-sm font-mono">$${inv.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `).join('')}
        </div>

        <!-- Footer -->
        <div class="mt-20 pt-10 border-t border-black/10 flex justify-between items-center opacity-50">
           <div class="text-[8px] font-black uppercase tracking-widest">Zoho Books Outstanding Engine</div>
           <div class="text-[8px] font-medium uppercase tracking-tighter">Generated: ${new Date().toLocaleString()}</div>
        </div>
      </div>
    `;

    this.targets.renderArea.innerHTML = html;
  }

  downloadPDF() {
    const element = document.getElementById('pdf-content');
    const opt = {
      margin: 0,
      filename: `Statement_${this.state.selectedCustomer.contact_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    this.showLoading("Synthesizing Print Document...");
    html2pdf().set(opt).from(element).save().then(() => {
      this.hideLoading();
      this.log("PDF Export Complete.");
    });
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
    this.log(`Error: ${msg}`);
  }

  hideError() {
    this.views.landingError.classList.add('view-hidden');
  }

  log(msg) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const div = document.createElement('div');
    div.className = "border-l border-white/10 pl-3 mb-1";
    div.innerHTML = `<span class="text-neutral-600 font-bold">${time}</span> ${msg}`;
    this.targets.log.prepend(div);
  }

  logout() {
    localStorage.removeItem('zoho_access_token');
    this.state.accessToken = null;
    window.location.reload();
  }
}

const app = new ZohoStatementApp();
window.zohoApp = app;
