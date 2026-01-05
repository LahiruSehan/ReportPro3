
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
      this.handleOAuthCallback();
      this.checkSession();
    });
  }

  cacheDOM() {
    this.views = {
      landing: document.getElementById('view-landing'),
      dashboard: document.getElementById('view-dashboard'),
      configModal: document.getElementById('modal-config'),
      loading: document.getElementById('loading-overlay')
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
      loadingText: document.getElementById('loading-text')
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
    this.log("Config updated.");
  }

  startAuth() {
    if (!this.config.clientId) return alert("Please set Client ID in settings.");
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ";
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?scope=${scopes}&client_id=${this.config.clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent`;
    window.location.href = authUrl;
  }

  handleOAuthCallback() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      this.state.accessToken = params.get('access_token');
      localStorage.setItem('zoho_access_token', this.state.accessToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      this.log("Auth success.");
      this.checkSession();
    }
  }

  async checkSession() {
    if (this.state.accessToken) {
      this.showLoading("Waking session...");
      const success = await this.fetchInitialData();
      if (success) {
        this.views.landing.classList.add('view-hidden');
        this.views.dashboard.classList.remove('view-hidden');
      } else {
        this.logout();
      }
      this.hideLoading();
    }
  }

  async fetchInitialData() {
    try {
      // 1. Fetch Org Info
      const orgRes = await this.apiCall('settings/orgprofile');
      if (orgRes) {
        this.state.org = orgRes.organization;
        this.targets.orgName.innerText = this.state.org.name;
      }

      // 2. Fetch Customers
      const custRes = await this.apiCall('contacts?contact_type=customer&status=active');
      if (custRes) {
        this.state.customers = custRes.contacts;
        this.populateCustomerSelect();
      }
      return true;
    } catch (e) {
      this.log("Session invalid or API error.");
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
    const res = await fetch(url, {
      headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}` }
    });
    if (res.status === 401) throw new Error("Unauthorized");
    return res.ok ? await res.json() : null;
  }

  async generateStatement() {
    const customerId = this.inputs.customer.value;
    const from = this.inputs.from.value;
    const to = this.inputs.to.value;

    if (!customerId || !from || !to) return alert("Fill all fields.");

    this.showLoading("Fetching Outstanding Ledger...");
    this.log(`Filtering for ${this.state.selectedCustomer.contact_name}...`);

    try {
      // 1. Fetch list of invoices for date range
      // Zoho filters: status=open,overdue
      const invListRes = await this.apiCall(`invoices?customer_id=${customerId}&date_start=${from}&date_end=${to}&status=sent,overdue`);
      
      if (!invListRes || !invListRes.invoices.length) {
        this.targets.renderArea.innerHTML = '<div class="p-20 text-center text-neutral-400">No outstanding invoices found for this period.</div>';
        this.btns.download.disabled = true;
        this.hideLoading();
        return;
      }

      // 2. We need line items. Zoho list API doesn't provide them. 
      // Fetch details for each invoice in the list.
      const detailedInvoices = [];
      for (const inv of invListRes.invoices) {
        this.showLoading(`Retrieving items: ${inv.invoice_number}`);
        const detail = await this.apiCall(`invoices/${inv.invoice_id}`);
        if (detail) detailedInvoices.push(detail.invoice);
      }

      this.state.statementData = detailedInvoices;
      this.renderStatementUI();
      this.btns.download.disabled = false;
      this.targets.emptyState.classList.add('view-hidden');
    } catch (e) {
      this.log("Error fetching: " + e.message);
    } finally {
      this.hideLoading();
    }
  }

  renderStatementUI() {
    const invoices = this.state.statementData;
    const org = this.state.org;
    const customer = this.state.selectedCustomer;
    const totalDue = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);
    
    // Check column toggles
    const activeCols = Array.from(document.querySelectorAll('#column-toggles input:checked')).map(i => i.dataset.col);

    let html = `
      <div class="statement-view animate-fade" id="pdf-content">
        <!-- Header -->
        <div class="flex justify-between items-start mb-10 pb-6 border-b-2 border-black">
          <div>
            <h1 class="text-3xl font-black uppercase tracking-tighter">${org.name}</h1>
            <p class="text-[10px] text-neutral-600 uppercase font-bold tracking-widest mt-1">Outstanding Customer Statement</p>
          </div>
          <div class="text-right">
            <p class="font-bold">Period</p>
            <p class="text-neutral-600">${this.inputs.from.value} to ${this.inputs.to.value}</p>
          </div>
        </div>

        <!-- Addresses -->
        <div class="grid grid-cols-2 gap-10 mb-10">
          <div>
            <h4 class="text-[9px] font-black uppercase text-neutral-400 mb-2">Statement To:</h4>
            <p class="text-lg font-black">${customer.contact_name}</p>
          </div>
          <div class="bg-neutral-50 p-4 border border-black/5">
             <div class="flex justify-between items-center mb-1">
                <span class="text-[9px] font-black uppercase text-neutral-400">Total Outstanding</span>
                <span class="text-xl font-black">$${totalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
             </div>
             <p class="text-[8px] text-neutral-500 uppercase tracking-widest">Calculated across ${invoices.length} invoices</p>
          </div>
        </div>

        <!-- Invoices -->
        <div class="space-y-12">
          ${invoices.map(inv => `
            <div class="invoice-block">
              <!-- Invoice Meta -->
              <div class="flex justify-between items-end bg-neutral-100 p-3 mb-2">
                <div>
                  <span class="text-[9px] font-black uppercase text-neutral-400">Invoice Reference</span>
                  <p class="font-black text-sm">${inv.invoice_number}</p>
                </div>
                <div class="text-right">
                   <div class="flex space-x-4 text-[10px]">
                      <div><span class="font-bold">Date:</span> ${inv.date}</div>
                      ${activeCols.includes('due_date') ? `<div><span class="font-bold">Due:</span> ${inv.due_date}</div>` : ''}
                      ${activeCols.includes('status') ? `<div class="uppercase font-black text-indigo-600">[${inv.status}]</div>` : ''}
                   </div>
                </div>
              </div>

              <!-- Item Table -->
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-black text-[9px] font-black uppercase">
                    ${activeCols.includes('sku') ? `<th class="py-2 w-24">SKU</th>` : ''}
                    <th class="py-2">Item Description</th>
                    <th class="py-2 text-right">Qty</th>
                    <th class="py-2 text-right">Rate</th>
                    <th class="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-black/5 text-[11px]">
                  ${inv.line_items.map(item => `
                    <tr>
                      ${activeCols.includes('sku') ? `<td class="py-2 font-mono text-[9px]">${item.sku || 'N/A'}</td>` : ''}
                      <td class="py-2 font-medium">${item.name}</td>
                      <td class="py-2 text-right">${item.quantity}</td>
                      <td class="py-2 text-right">${item.rate.toFixed(2)}</td>
                      <td class="py-2 text-right font-medium">${item.item_total.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr class="border-t border-black font-black">
                    <td colspan="${activeCols.includes('sku') ? 4 : 3}" class="py-3 text-right text-[10px] uppercase">Invoice Balance Due:</td>
                    <td class="py-3 text-right text-sm font-mono">$${inv.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `).join('')}
        </div>

        <!-- Footer -->
        <div class="mt-20 pt-10 border-t-2 border-black flex justify-between items-center opacity-60">
           <div class="text-[8px] font-black uppercase tracking-widest">Generated via Zoho Books Insight Engine</div>
           <div class="text-[8px] font-medium italic">Page 1 of 1</div>
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

    this.showLoading("Synthesizing PDF Document...");
    html2pdf().set(opt).from(element).save().then(() => {
      this.hideLoading();
      this.log("PDF synthesis complete.");
    });
  }

  showLoading(text) {
    this.targets.loadingText.innerText = text || "Synchronizing...";
    this.views.loading.classList.remove('view-hidden');
  }

  hideLoading() {
    this.views.loading.classList.add('view-hidden');
  }

  log(msg) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const div = document.createElement('div');
    div.innerHTML = `<span class="text-neutral-600">[${time}]</span> ${msg}`;
    this.targets.log.prepend(div);
  }

  logout() {
    localStorage.removeItem('zoho_access_token');
    window.location.reload();
  }
}

// Initializing the master instance
const app = new ZohoStatementApp();
window.zohoApp = app;
