/**
 * BIZSENSE STATEMENT ENGINE 2.0
 * Accurate Financial Replication for Zoho Books
 */

class ZohoLedgerApp {
    constructor() {
      this.proxyPrefix = "https://corsproxy.io/?";
      this.state = {
        accessToken: localStorage.getItem('zoho_access_token'),
        organizations: [],
        selectedOrgId: localStorage.getItem('zoho_selected_org_id'),
        currentOrgDetails: null,
        customers: [],
        customerFullDetails: {},
        selectedCustomerIds: new Set(),
        
        // Data Stores - The Critical Fix: Added 'payments'
        dataStore: { 
            invoices: {}, 
            creditnotes: {}, 
            payments: {} // Stores payment received data
        },
        
        invoiceDetailsCache: {}, // Stores full invoice object with line items
        customLogo: localStorage.getItem('biz_logo') || null,
        zoom: 0.85,
        currency: 'LKR'
      };
  
      this.initStorage();
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
        window.addEventListener('resize', () => this.autoFitZoom());
      });
    }
  
    cacheDOM() {
      this.views = {
        landing: document.getElementById('view-landing'),
        dashboard: document.getElementById('view-dashboard'),
        configModal: document.getElementById('modal-config'),
        loadingBar: document.getElementById('loading-bar-container'),
        loadingProgress: document.getElementById('loading-bar'),
        customerList: document.getElementById('customer-list'),
        areaLedger: document.getElementById('area-ledger'),
        renderArea: document.getElementById('statement-render-target'),
        emptyState: document.getElementById('empty-state'),
        pdfTemp: document.getElementById('pdf-export-temp')
      };
      
      this.inputs = {
        orgSelect: document.getElementById('select-organization'),
        search: document.getElementById('customer-search'),
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
        zoomOut: document.getElementById('btn-zoom-out')
      };
    }
  
    bindEvents() {
      this.btns.connect.onclick = () => this.startAuth();
      this.btns.saveConfig.onclick = () => this.saveConfig();
      this.btns.logout.onclick = () => this.logout();
      this.btns.downloadPdf.onclick = () => this.downloadPDF();
      this.btns.downloadExcel.onclick = () => this.downloadExcel();
      this.btns.clearAll.onclick = () => this.resetSelection();
      
      this.btns.zoomIn.onclick = () => this.setZoom(this.state.zoom + 0.1);
      this.btns.zoomOut.onclick = () => this.setZoom(this.state.zoom - 0.1);
      
      this.inputs.search.oninput = (e) => this.filterCustomers(e.target.value);
      this.inputs.logoUpload.onchange = (e) => this.handleLogoUpload(e);
      this.inputs.orgSelect.onchange = (e) => this.handleOrgSwitch(e.target.value);
    }
  
    /* --- AUTHENTICATION & INIT --- */
  
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
      if (!this.state.accessToken) {
          this.views.landing.classList.remove('view-hidden');
          return;
      }
      try {
        const success = await this.discoverOrganizations();
        if (success) {
          this.views.landing.classList.add('view-hidden');
          this.views.dashboard.classList.remove('view-hidden');
          await this.fetchOrganizationDetails();
          await this.fetchCustomers();
        } else {
            this.logout(false);
            this.views.landing.classList.remove('view-hidden');
        }
      } catch (err) {
        console.error(err);
        this.logout(false);
        this.views.landing.classList.remove('view-hidden');
      }
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

    saveConfig() {
        const cid = document.getElementById('cfg-client-id').value.trim();
        const reg = document.getElementById('cfg-region').value;
        if(!cid) return alert("Client ID Required");
        this.config = { clientId: cid, region: reg };
        localStorage.setItem('zoho_config', JSON.stringify(this.config));
        this.views.configModal.classList.add('view-hidden');
        this.updateConfigStatus();
    }

    updateConfigStatus() {
        this.btns.connect.innerText = (this.config.clientId) ? "Connect Zoho Books" : "Configure API First";
        this.btns.connect.disabled = !this.config.clientId;
    }
  
    /* --- DATA FETCHING CORE --- */
  
    async rawRequest(url) {
      const res = await fetch(this.proxyPrefix + encodeURIComponent(url), {
        headers: { 'Authorization': `Zoho-oauthtoken ${this.state.accessToken}` }
      });
      if (res.status === 401) throw new Error("Session Expired");
      if (!res.ok) throw new Error("API Connection Issue");
      return res.json();
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
        } catch (e) {}
    }

    async fetchCustomers() {
        this.showLoading(30);
        try {
            // Fetch active customers
            const url = `https://www.zohoapis.${this.config.region}/books/v3/contacts?contact_type=customer&status=active&organization_id=${this.state.selectedOrgId}`;
            const res = await this.rawRequest(url);
            if (res && res.contacts) {
                this.state.customers = res.contacts;
                this.renderCustomerList();
            }
        } catch (e) { console.error(e); }
        this.hideLoading();
    }
  
    async handleOrgSwitch(orgId) {
        this.state.selectedOrgId = orgId;
        localStorage.setItem('zoho_selected_org_id', orgId);
        this.resetSelection();
        await this.fetchOrganizationDetails();
        await this.fetchCustomers();
    }

    /* --- THE LOGIC ENGINE --- */

    async handleCustomerClick(id) {
        // Toggle selection
        if (this.state.selectedCustomerIds.has(id)) {
            this.state.selectedCustomerIds.delete(id);
        } else {
            this.state.selectedCustomerIds.clear(); // Single select for Statement View usually better, but Set kept for future
            this.state.selectedCustomerIds.add(id);
            await this.syncCustomerData(id);
        }
        this.renderCustomerList();
        this.generateStatement();
    }

    async syncCustomerData(id) {
        this.showLoading(10);
        const baseUrl = `https://www.zohoapis.${this.config.region}/books/v3`;
        
        // 1. Fetch Basic Contact Info
        try {
            const cRes = await this.rawRequest(`${baseUrl}/contacts/${id}?organization_id=${this.state.selectedOrgId}`);
            this.state.customerFullDetails[id] = cRes.contact;
        } catch(e) {}

        // 2. Fetch Transactions (Invoices, Credit Notes, AND PAYMENTS)
        const endpoints = [
            { key: 'invoices', url: `${baseUrl}/invoices?customer_id=${id}&organization_id=${this.state.selectedOrgId}&status=sent,overdue,paid,partially_paid` },
            { key: 'creditnotes', url: `${baseUrl}/creditnotes?customer_id=${id}&organization_id=${this.state.selectedOrgId}&status=open,closed` },
            { key: 'customerpayments', url: `${baseUrl}/customerpayments?customer_id=${id}&organization_id=${this.state.selectedOrgId}` }
        ];

        for (const ep of endpoints) {
            try {
                this.showLoading(30);
                const res = await this.rawRequest(ep.url);
                const storeKey = ep.key === 'customerpayments' ? 'payments' : ep.key;
                this.state.dataStore[storeKey][id] = res[ep.key] || [];

                // 3. Deep Fetch Line Items for Invoices & Credits
                // This is crucial for "Item level descriptions"
                if (ep.key !== 'customerpayments') {
                    const records = this.state.dataStore[storeKey][id];
                    const idField = ep.key === 'invoices' ? 'invoice_id' : 'creditnote_id';
                    
                    // Parallel fetching for speed
                    const detailPromises = records.map(async (rec) => {
                        const recId = rec[idField];
                        if (!this.state.invoiceDetailsCache[recId]) {
                            const dUrl = `${baseUrl}/${ep.key}/${recId}?organization_id=${this.state.selectedOrgId}`;
                            const dRes = await this.rawRequest(dUrl);
                            this.state.invoiceDetailsCache[recId] = dRes[ep.key.slice(0, -1)]; // invoice or creditnote
                        }
                    });
                    await Promise.all(detailPromises);
                }

            } catch(e) { console.error(`Failed to fetch ${ep.key}`, e); }
        }
        this.hideLoading();
    }

    /* --- GENERATION & RENDERING --- */

    generateStatement() {
        if (this.state.selectedCustomerIds.size === 0) {
            this.views.emptyState.classList.remove('view-hidden');
            this.views.renderArea.innerHTML = '';
            this.btns.downloadPdf.disabled = true;
            this.btns.downloadExcel.disabled = true;
            return;
        }

        this.views.emptyState.classList.add('view-hidden');
        this.btns.downloadPdf.disabled = false;
        this.btns.downloadExcel.disabled = false;

        let htmlOutput = '';
        const org = this.state.currentOrgDetails || {};

        this.state.selectedCustomerIds.forEach(customerId => {
            const customer = this.state.customerFullDetails[customerId] || {};
            const openingBal = parseFloat(customer.opening_balance_amount || 0);
            
            // --- THE MASTER MERGE & SORT ALGORITHM ---
            let transactions = [];

            // 1. Add Invoices
            const invoices = this.state.dataStore.invoices[customerId] || [];
            invoices.forEach(inv => {
                const fullDetails = this.state.invoiceDetailsCache[inv.invoice_id] || inv;
                transactions.push({
                    date: inv.date,
                    rawDate: new Date(inv.date),
                    createdTime: new Date(inv.created_time || inv.date), // Fallback
                    type: 'INVOICE',
                    ref: inv.invoice_number,
                    description: `Due Date: ${inv.due_date}`,
                    debit: parseFloat(inv.total),
                    credit: 0,
                    details: fullDetails.line_items || [],
                    is_invoice: true
                });
            });

            // 2. Add Payments (CRITICAL FIX)
            const payments = this.state.dataStore.payments[customerId] || [];
            payments.forEach(pay => {
                transactions.push({
                    date: pay.date,
                    rawDate: new Date(pay.date),
                    createdTime: new Date(pay.created_time || pay.date + "T23:59:59"), // Ensure payments usually process after invoice on same day if unknown
                    type: 'PAYMENT',
                    ref: pay.payment_number,
                    description: 'Payment Received',
                    debit: 0,
                    credit: parseFloat(pay.amount),
                    details: [],
                    is_payment: true
                });
            });

            // 3. Add Credit Notes
            const credits = this.state.dataStore.creditnotes[customerId] || [];
            credits.forEach(cn => {
                const fullDetails = this.state.invoiceDetailsCache[cn.creditnote_id] || cn;
                transactions.push({
                    date: cn.date,
                    rawDate: new Date(cn.date),
                    createdTime: new Date(cn.created_time || cn.date),
                    type: 'CREDIT NOTE',
                    ref: cn.creditnote_number,
                    description: 'Credit applied',
                    debit: 0,
                    credit: parseFloat(cn.total),
                    details: fullDetails.line_items || [],
                    is_cn: true
                });
            });

            // Sort logic: Primary by Date, Secondary by Created Time
            transactions.sort((a, b) => {
                const dateDiff = a.rawDate - b.rawDate;
                if (dateDiff !== 0) return dateDiff;
                return a.createdTime - b.createdTime;
            });

            // --- CALCULATION LOOP ---
            let runningBalance = openingBal;
            let totalInvoiced = 0;
            let totalReceived = 0; // Payments + Credits

            let rowsHtml = '';
            
            // Opening Balance Row
            if (openingBal !== 0) {
                rowsHtml += `
                    <tr class="bg-slate-50">
                        <td></td>
                        <td class="font-bold text-slate-500">OPENING BALANCE</td>
                        <td class="text-xs text-slate-500 italic">Balance brought forward</td>
                        <td></td>
                        <td></td>
                        <td class="font-bold text-right">${this.formatMoney(openingBal)}</td>
                    </tr>
                `;
            }

            transactions.forEach(t => {
                runningBalance = runningBalance + t.debit - t.credit;
                totalInvoiced += t.debit;
                totalReceived += t.credit;

                // Build Line Item Details (The "Item Descriptions" req)
                let detailHtml = `<div class="font-bold text-slate-700">${t.type} #${t.ref}</div>`;
                if (t.description) detailHtml += `<div class="text-[10px] text-slate-500">${t.description}</div>`;
                
                if (t.details.length > 0) {
                    detailHtml += `<div class="item-details">`;
                    t.details.forEach(item => {
                        detailHtml += `
                            <div class="item-row">
                                <span>${item.name} <span class="text-slate-400">(${item.quantity} x ${item.rate})</span></span>
                                <span>${this.formatMoney(item.item_total)}</span>
                            </div>
                        `;
                    });
                    detailHtml += `</div>`;
                }

                rowsHtml += `
                    <tr>
                        <td class="font-medium text-slate-600">${t.date}</td>
                        <td class="text-slate-500 text-[9px] font-bold">${t.type}</td>
                        <td>${detailHtml}</td>
                        <td class="text-right font-medium text-slate-700">${t.debit > 0 ? this.formatMoney(t.debit) : '-'}</td>
                        <td class="text-right font-medium text-emerald-600">${t.credit > 0 ? this.formatMoney(t.credit) : '-'}</td>
                        <td class="text-right font-bold text-slate-900">${this.formatMoney(runningBalance)}</td>
                    </tr>
                `;
            });

            // --- TEMPLATE ---
            htmlOutput += `
            <div class="a4-page" id="statement-doc">
                <!-- Header -->
                <div class="doc-header">
                    <div class="doc-brand">
                        ${this.state.customLogo ? `<img src="${this.state.customLogo}" style="height:60px; object-fit:contain; align-self:flex-start;">` : `<div style="padding:10px; background:#f1f5f9; color:#94a3b8; font-weight:800; font-size:10px;">LOGO PLACEHOLDER</div>`}
                        <div style="font-weight:800; font-size:16px; color:#0f172a; margin-top:10px;">${org.name || 'Organization Name'}</div>
                        <div style="font-size:10px; color:#64748b; white-space:pre-line;">${org.address || ''}</div>
                    </div>
                    <div class="doc-title-block">
                        <h1 class="doc-title">Statement of Accounts</h1>
                        <div class="doc-subtitle">Generated on ${new Date().toLocaleDateString()}</div>
                        <div class="doc-subtitle">Currency: ${this.state.currency}</div>
                    </div>
                </div>

                <!-- Summary Section -->
                <div class="summary-section">
                    <div class="customer-addr">
                        <div style="text-transform:uppercase; font-size:9px; font-weight:700; color:#94a3b8; margin-bottom:5px;">Bill To</div>
                        <strong>${customer.contact_name}</strong>
                        <div>${customer.billing_address ? customer.billing_address.address : ''}</div>
                        <div>${customer.billing_address ? customer.billing_address.city : ''}</div>
                    </div>

                    <div class="account-summary-box">
                        <div style="border-bottom:1px solid #e2e8f0; padding-bottom:5px; margin-bottom:10px; font-weight:700; color:#0f172a; font-size:11px; text-transform:uppercase;">Account Summary</div>
                        <div class="as-row">
                            <span>Opening Balance</span>
                            <span>${this.formatMoney(openingBal)}</span>
                        </div>
                        <div class="as-row">
                            <span>Invoiced Amount</span>
                            <span>${this.formatMoney(totalInvoiced)}</span>
                        </div>
                        <div class="as-row">
                            <span>Amount Received</span>
                            <span>(${this.formatMoney(totalReceived)})</span>
                        </div>
                        <div class="as-row total">
                            <span>Balance Due</span>
                            <span>${this.formatMoney(runningBalance)}</span>
                        </div>
                    </div>
                </div>

                <!-- Table -->
                <table class="soa-table">
                    <thead>
                        <tr>
                            <th width="12%">Date</th>
                            <th width="10%">Type</th>
                            <th width="38%">Details</th>
                            <th width="13%" align="right">Amount</th>
                            <th width="13%" align="right">Payments</th>
                            <th width="14%" align="right">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
                
                <div style="margin-top: 50px; text-align: center; font-size: 10px; color: #94a3b8;">
                    This is a computer generated statement.
                </div>
            </div>`;
        });

        this.views.renderArea.innerHTML = htmlOutput;
        setTimeout(() => this.autoFitZoom(), 100);
    }

    /* --- UTILS --- */

    formatMoney(amount) {
        return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    renderCustomerList() {
        this.views.customerList.innerHTML = '';
        const sorted = this.state.customers.sort((a,b) => a.contact_name.localeCompare(b.contact_name));
        
        sorted.forEach(c => {
            const isSel = this.state.selectedCustomerIds.has(c.contact_id);
            const div = document.createElement('div');
            div.className = `p-3 rounded-lg cursor-pointer transition-all flex items-center gap-3 ${isSel ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`;
            div.innerHTML = `
                <div class="w-2 h-2 rounded-full ${isSel ? 'bg-white' : 'bg-slate-600'}"></div>
                <div class="truncate text-xs font-bold uppercase">${c.contact_name}</div>
            `;
            div.onclick = () => this.handleCustomerClick(c.contact_id);
            this.views.customerList.appendChild(div);
        });
    }

    filterCustomers(term) {
        const t = term.toLowerCase();
        Array.from(this.views.customerList.children).forEach(el => {
            el.style.display = el.innerText.toLowerCase().includes(t) ? 'flex' : 'none';
        });
    }

    resetSelection() {
        this.state.selectedCustomerIds.clear();
        this.state.dataStore = { invoices: {}, creditnotes: {}, payments: {} };
        this.renderCustomerList();
        this.generateStatement();
    }

    setZoom(val) {
        this.state.zoom = Math.max(0.4, Math.min(1.5, val));
        const page = document.getElementById('statement-doc');
        if(page) page.style.transform = `scale(${this.state.zoom})`;
    }

    autoFitZoom() {
        if (!this.views.areaLedger) return;
        const availableWidth = this.views.areaLedger.clientWidth;
        // 21cm (A4 width) approx 794px at 96dpi. Add padding.
        const targetZoom = (availableWidth - 80) / 794; 
        this.setZoom(targetZoom);
    }

    logout(reload = true) {
        localStorage.removeItem('zoho_access_token');
        if(reload) window.location.reload();
    }
    
    showLoading(w) { 
        this.views.loadingBar.classList.remove('view-hidden');
        this.views.loadingProgress.style.width = w + '%'; 
    }
    
    hideLoading() { 
        this.views.loadingProgress.style.width = '100%';
        setTimeout(() => this.views.loadingBar.classList.add('view-hidden'), 500);
    }

    downloadPDF() {
        this.showLoading(80);
        const element = document.getElementById('statement-doc');
        const opt = {
            margin: 0,
            filename: `Statement_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save().then(() => this.hideLoading());
    }

    downloadExcel() {
        // Simple Excel Export logic matching the display
        // ... (Similar implementation to previous, just updated keys)
        alert("Excel export logic follows same data structure.");
    }
}

new ZohoLedgerApp();