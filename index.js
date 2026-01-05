
/**
 * ZOHO INSIGHT PRO - REAL WORLD ENGINE
 * Handles Live OAuth2 and Books API V3
 */

class ZohoInsightApp {
  constructor() {
    this.config = JSON.parse(localStorage.getItem('zoho_config')) || {
      clientId: '',
      orgId: '',
      region: 'com'
    };
    
    this.state = {
      accessToken: null,
      data: [],
      currentView: 'overview'
    };

    this.init();
  }

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.handleCallback();
    this.checkSession();
    this.updateRedirectUriDisplay();
  }

  cacheDOM() {
    this.viewLanding = document.getElementById('view-landing');
    this.viewDashboard = document.getElementById('view-dashboard');
    this.btnConnect = document.getElementById('btn-connect');
    this.btnSync = document.getElementById('btn-sync');
    this.btnGeneratePdf = document.getElementById('btn-generate-pdf');
    this.datasetLog = document.getElementById('dataset-log');
    this.tableRecent = document.getElementById('table-recent');
    this.statusDot = document.getElementById('status-dot');
    this.modalConfig = document.getElementById('modal-config');
    this.displayUri = document.getElementById('display-uri');
    
    // Config elements
    this.btnOpenConfigLanding = document.getElementById('btn-open-config-landing');
    this.btnOpenConfigSidebar = document.getElementById('btn-open-config-sidebar');
    this.btnCloseConfig = document.getElementById('btn-close-config');
    this.btnSaveConfig = document.getElementById('btn-save-config');
    this.btnClearLogs = document.getElementById('btn-clear-logs');
  }

  bindEvents() {
    this.btnConnect.addEventListener('click', () => this.startAuth());
    document.getElementById('btn-logout').addEventListener('click', () => this.logout());
    this.btnSync.addEventListener('click', () => this.syncLiveInvoices());
    this.btnGeneratePdf.addEventListener('click', () => this.generatePDF());

    // Config Modal Listeners
    this.btnOpenConfigLanding?.addEventListener('click', () => this.toggleConfig(true));
    this.btnOpenConfigSidebar?.addEventListener('click', () => this.toggleConfig(true));
    this.btnCloseConfig?.addEventListener('click', () => this.toggleConfig(false));
    this.btnSaveConfig?.addEventListener('click', () => this.saveConfig());
    this.btnClearLogs?.addEventListener('click', () => this.clearLogs());

    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-target');
        this.switchView(target);
      });
    });
  }

  updateRedirectUriDisplay() {
    if (this.displayUri) {
      this.displayUri.innerText = window.location.origin + window.location.pathname;
    }
  }

  // --- CONFIG & AUTH ---

  toggleConfig(show) {
    if (!this.modalConfig) return;
    this.modalConfig.classList.toggle('view-hidden', !show);
    if (show) {
      document.getElementById('cfg-client-id').value = this.config.clientId || '';
      document.getElementById('cfg-org-id').value = this.config.orgId || '';
      document.getElementById('cfg-region').value = this.config.region || 'com';
    }
  }

  saveConfig() {
    this.config = {
      clientId: document.getElementById('cfg-client-id').value.trim(),
      orgId: document.getElementById('cfg-org-id').value.trim(),
      region: document.getElementById('cfg-region').value
    };
    localStorage.setItem('zoho_config', JSON.stringify(this.config));
    this.toggleConfig(false);
    this.log(`Config saved successfully for region ${this.config.region}.`);
  }

  startAuth() {
    if (!this.config.clientId) {
      alert("Required: Provide a Client ID in Settings before connecting.");
      this.toggleConfig(true);
      return;
    }

    const scope = "ZohoBooks.invoices.READ,ZohoBooks.contacts.READ";
    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://accounts.zoho.${this.config.region}/oauth/v2/auth?` + 
      `scope=${scope}&` +
      `client_id=${this.config.clientId}&` +
      `response_type=token&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `prompt=consent`;

    this.log(`Requesting authorization from Zoho accounts.${this.config.region}...`);
    window.location.href = authUrl;
  }

  handleCallback() {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    
    if (token) {
      this.state.accessToken = token;
      localStorage.setItem('zoho_access_token', token);
      window.history.replaceState({}, document.title, window.location.pathname);
      this.setConnectedUI(true);
      this.log("Auth Stream Established: Token stored for session.");
      this.syncLiveInvoices();
    }
  }

  checkSession() {
    const token = localStorage.getItem('zoho_access_token');
    if (token) {
      this.state.accessToken = token;
      this.setConnectedUI(true);
      this.switchView('overview');
    }
  }

  setConnectedUI(connected) {
    if (connected) {
      this.viewLanding.classList.add('view-hidden');
      this.viewDashboard.classList.remove('view-hidden');
      this.statusDot.classList.replace('bg-red-500', 'bg-green-500');
      document.getElementById('sync-status').innerText = "Live / Secured";
      document.getElementById('view-subtitle').innerText = `Organization Context: ${this.config.orgId || 'Manual Setup Required'}`;
    }
  }

  logout() {
    localStorage.removeItem('zoho_access_token');
    this.log("Session terminated. Clearing cache...");
    window.location.reload();
  }

  // --- DATA FETCHING ---

  async syncLiveInvoices() {
    if (!this.state.accessToken) return;
    if (!this.config.orgId) {
      this.log("Wait: Organization ID is required. Please check settings.");
      this.toggleConfig(true);
      return;
    }

    this.log(`Initiating sync for Org ${this.config.orgId}...`);
    this.btnSync.disabled = true;
    this.btnSync.innerText = "Processing...";

    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/invoices?organization_id=${this.config.orgId}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({message: 'Handshake failed with Zoho API.'}));
        throw new Error(error.message || `API Error: ${response.status}`);
      }

      const result = await response.json();
      this.state.data = result.invoices || [];
      this.updateUI();
      this.log(`Sync Complete: Found ${this.state.data.length} invoices.`);
    } catch (err) {
      this.log(`SYNC ERROR: ${err.message}`);
      if (err.message.toLowerCase().includes('token')) {
        this.log("Security Note: Access token may have expired. Re-authenticate.");
      }
    } finally {
      this.btnSync.disabled = false;
      this.btnSync.innerText = "Sync Live Data";
    }
  }

  updateUI() {
    const total = this.state.data.reduce((acc, inv) => acc + (inv.total || 0), 0);
    document.getElementById('stat-revenue').innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('stat-pending').innerText = this.state.data.length;

    this.tableRecent.innerHTML = this.state.data.map(inv => `
      <tr class="hover:bg-white/[0.04] transition-colors border-b border-white/5">
        <td class="py-5 px-2 font-mono text-[11px] text-indigo-400 font-bold">${inv.invoice_number}</td>
        <td class="py-5 font-medium text-neutral-200">${inv.customer_name}</td>
        <td class="py-5">
          <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            ${inv.status}
          </span>
        </td>
        <td class="py-5 text-right font-mono font-bold px-2">$${inv.total.toFixed(2)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="py-20 text-center text-neutral-600 font-light italic">No live invoice data detected in this organization.</td></tr>';
  }

  // --- UTILS ---

  switchView(viewId) {
    this.state.currentView = viewId;
    document.querySelectorAll('[id^="content-"]').forEach(el => el.classList.add('view-hidden'));
    document.getElementById(`content-${viewId}`).classList.remove('view-hidden');
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-target') === viewId);
    });
    document.getElementById('view-title').innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    if (viewId === 'reports') this.prepareReport();
  }

  log(msg) {
    if (!this.datasetLog) return;
    const time = new Date().toLocaleTimeString();
    this.datasetLog.innerHTML += `<div><span class="text-neutral-600">[${time}]</span> ${msg}</div>`;
    this.datasetLog.scrollTop = this.datasetLog.scrollHeight;
    console.log(`[ZOHO]: ${msg}`);
  }

  clearLogs() {
    if (this.datasetLog) this.datasetLog.innerHTML = '<div class="text-neutral-700 font-italic">--- Output Stream Cleared ---</div>';
  }

  prepareReport() {
    document.getElementById('report-date').innerText = `Generated: ${new Date().toLocaleString()}`;
    const container = document.getElementById('report-table-container');
    container.innerHTML = `
      <table class="w-full text-left text-[11px] mt-10 border-t border-white/10">
        <thead>
          <tr class="text-neutral-500 font-black">
            <th class="py-4">INVOICE ID</th>
            <th class="py-4">CUSTOMER ENTITY</th>
            <th class="py-4">LATEST STATUS</th>
            <th class="py-4 text-right">GROSS TOTAL</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          ${this.state.data.map(d => `
            <tr>
              <td class="py-3 text-neutral-500 font-mono">${d.invoice_number}</td>
              <td class="py-3 font-bold">${d.customer_name}</td>
              <td class="py-3 uppercase text-[10px]">${d.status}</td>
              <td class="py-3 text-right font-mono font-bold">$${d.total.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  generatePDF() {
    const element = document.getElementById('report-template');
    this.btnGeneratePdf.innerText = "Processing Assets...";
    html2pdf().set({
      margin: 0.5,
      filename: `ZohoInsight_Report_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 3, backgroundColor: '#050505', logging: false },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(element).save().then(() => {
      this.btnGeneratePdf.innerText = "Download Official PDF";
    });
  }
}

window.app = new ZohoInsightApp();
