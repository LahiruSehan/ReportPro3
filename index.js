
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
    this.log(`Config updated. Client ID: ${this.config.clientId.substring(0,8)}...`);
  }

  startAuth() {
    if (!this.config.clientId) {
      alert("Please configure your Client ID first in Settings.");
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

    this.log(`Redirecting to Zoho Auth (${this.config.region})...`);
    window.location.href = authUrl;
  }

  handleCallback() {
    // Check for access_token in URL fragment (Implicit Grant)
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    
    if (token) {
      this.state.accessToken = token;
      localStorage.setItem('zoho_access_token', token);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      this.setConnectedUI(true);
      this.log("Auth Successful: Access token received.");
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
      document.getElementById('sync-status').innerText = "Live";
      document.getElementById('view-subtitle').innerText = `Org: ${this.config.orgId || 'Not Set'}`;
    }
  }

  logout() {
    localStorage.removeItem('zoho_access_token');
    window.location.reload();
  }

  // --- DATA FETCHING ---

  async syncLiveInvoices() {
    if (!this.state.accessToken) return;
    if (!this.config.orgId) {
      this.log("Error: Organization ID missing. Check settings.");
      return;
    }

    this.log(`Fetching invoices from organization ${this.config.orgId}...`);
    this.btnSync.disabled = true;
    this.btnSync.innerText = "Syncing...";

    try {
      const url = `https://www.zohoapis.${this.config.region}/books/v3/invoices?organization_id=${this.config.orgId}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${this.state.accessToken}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({message: 'API Request Failed'}));
        throw new Error(error.message || 'API Request Failed');
      }

      const result = await response.json();
      this.state.data = result.invoices || [];
      this.updateUI();
      this.log(`Success: Received ${this.state.data.length} invoices.`);
    } catch (err) {
      this.log(`CRITICAL ERROR: ${err.message}`);
      if (err.message.includes('expired') || err.message.includes('token')) {
        this.log("Token likely expired or invalid. Re-authenticating required.");
      }
    } finally {
      this.btnSync.disabled = false;
      this.btnSync.innerText = "Sync Live Data";
    }
  }

  updateUI() {
    // Stats
    const total = this.state.data.reduce((acc, inv) => acc + (inv.total || 0), 0);
    document.getElementById('stat-revenue').innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('stat-pending').innerText = this.state.data.length;

    // Table
    this.tableRecent.innerHTML = this.state.data.map(inv => `
      <tr class="hover:bg-white/[0.02]">
        <td class="py-4 font-mono text-xs text-indigo-400">${inv.invoice_number}</td>
        <td class="py-4 font-semibold">${inv.customer_name}</td>
        <td class="py-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/5 border border-white/10">
            ${inv.status}
          </span>
        </td>
        <td class="py-4 text-right font-mono font-bold">$${inv.total.toFixed(2)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="py-10 text-center text-neutral-600 italic">No live records found.</td></tr>';
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
    this.datasetLog.innerHTML += `<div>[${time}] ${msg}</div>`;
    this.datasetLog.scrollTop = this.datasetLog.scrollHeight;
    console.log(`[ZOHO]: ${msg}`);
  }

  clearLogs() {
    if (this.datasetLog) this.datasetLog.innerHTML = '[SYSTEM]: Log cleared.';
  }

  prepareReport() {
    document.getElementById('report-date').innerText = `Generated: ${new Date().toLocaleString()}`;
    const container = document.getElementById('report-table-container');
    container.innerHTML = `
      <table class="w-full text-left text-[10px] mt-8 border-t border-white/10">
        <thead>
          <tr class="text-neutral-500">
            <th class="py-2">ID</th>
            <th class="py-2">ENTITY</th>
            <th class="py-2">STATUS</th>
            <th class="py-2 text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          ${this.state.data.map(d => `
            <tr>
              <td class="py-2 text-neutral-500">${d.invoice_number}</td>
              <td class="py-2 font-bold">${d.customer_name}</td>
              <td class="py-2">${d.status.toUpperCase()}</td>
              <td class="py-2 text-right font-mono">$${d.total.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  generatePDF() {
    const element = document.getElementById('report-template');
    this.btnGeneratePdf.innerText = "Synthesizing...";
    html2pdf().set({
      margin: 0.5,
      filename: `Zoho_Report_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: '#050505', logging: false },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).from(element).save().then(() => {
      this.btnGeneratePdf.innerText = "Generate Pro PDF";
    });
  }
}

// Global scope expose strictly for debugging if needed, 
// but all listeners are now programmatically attached.
window.app = new ZohoInsightApp();
