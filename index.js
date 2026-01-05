
/**
 * ZOHO INSIGHT PRO - CORE ENGINE
 * Pure Vanilla implementation of Data & PDF Services
 */

const CONFIG = {
  MOCK_DATA: [
    { id: 'INV-001', date: '2024-01-15', customer: 'Nexus Corp', amount: 4500.00, status: 'Paid' },
    { id: 'INV-002', date: '2024-01-16', customer: 'Skyline Ltd', amount: 1200.50, status: 'Overdue' },
    { id: 'INV-003', date: '2024-01-18', customer: 'Vertex Solutions', amount: 3300.00, status: 'Sent' },
    { id: 'INV-004', date: '2024-01-19', customer: 'Global Logics', amount: 890.00, status: 'Paid' },
    { id: 'INV-005', date: '2024-01-20', customer: 'Terraform Inc', amount: 12500.00, status: 'Sent' },
  ]
};

class ZohoInsightApp {
  constructor() {
    this.state = {
      isLoggedIn: false,
      data: [],
      currentView: 'overview'
    };
    
    this.init();
  }

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.checkSession();
  }

  cacheDOM() {
    this.viewLanding = document.getElementById('view-landing');
    this.viewDashboard = document.getElementById('view-dashboard');
    this.viewTitle = document.getElementById('view-title');
    this.btnConnect = document.getElementById('btn-connect');
    this.btnLogout = document.getElementById('btn-logout');
    this.btnSync = document.getElementById('btn-sync');
    this.btnGeneratePdf = document.getElementById('btn-generate-pdf');
    this.tableRecent = document.getElementById('table-recent');
    this.datasetLog = document.getElementById('dataset-log');
    
    // Stats
    this.statRevenue = document.getElementById('stat-revenue');
    this.statPending = document.getElementById('stat-pending');
    this.statReceivables = document.getElementById('stat-receivables');
  }

  bindEvents() {
    this.btnConnect.addEventListener('click', () => this.handleLogin());
    this.btnLogout.addEventListener('click', () => this.handleLogout());
    this.btnSync.addEventListener('click', () => this.syncData());
    this.btnGeneratePdf.addEventListener('click', () => this.generatePDF());

    // Navigation
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('data-target');
        this.switchView(target);
      });
    });
  }

  checkSession() {
    const saved = localStorage.getItem('zoho_session');
    if (saved) this.handleLogin(true);
  }

  handleLogin(isSilent = false) {
    if (!isSilent) {
      this.btnConnect.innerHTML = "Authenticating...";
      this.btnConnect.disabled = true;
    }

    // Simulate OAuth delay
    setTimeout(() => {
      this.state.isLoggedIn = true;
      localStorage.setItem('zoho_session', 'active');
      
      this.viewLanding.classList.add('view-hidden');
      this.viewDashboard.classList.remove('view-hidden');
      
      if (!isSilent) this.syncData();
    }, isSilent ? 0 : 1200);
  }

  handleLogout() {
    this.state.isLoggedIn = false;
    localStorage.removeItem('zoho_session');
    location.reload();
  }

  switchView(viewId) {
    this.state.currentView = viewId;
    
    // UI Updates
    document.querySelectorAll('[id^="content-"]').forEach(el => el.classList.add('view-hidden'));
    document.getElementById(`content-${viewId}`).classList.remove('view-hidden');
    
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-target') === viewId);
    });

    this.viewTitle.innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    
    if (viewId === 'reports') {
      this.prepareReport();
    }
  }

  syncData() {
    this.log('Initializing secure handshake with Zoho API...');
    this.log('Fetching module: Invoices...');
    
    setTimeout(() => {
      this.state.data = CONFIG.MOCK_DATA;
      this.updateDashboard();
      this.log('Success: 5 invoices imported successfully.');
    }, 800);
  }

  log(msg) {
    if (!this.datasetLog) return;
    const time = new Date().toLocaleTimeString();
    this.datasetLog.innerHTML += `<div>[${time}] ${msg}</div>`;
    this.datasetLog.scrollTop = this.datasetLog.scrollHeight;
  }

  updateDashboard() {
    const total = this.state.data.reduce((acc, curr) => acc + curr.amount, 0);
    const pending = this.state.data.filter(i => i.status !== 'Paid').length;
    const receivables = this.state.data
      .filter(i => i.status !== 'Paid')
      .reduce((acc, curr) => acc + curr.amount, 0);

    this.statRevenue.innerText = `$${total.toLocaleString()}`;
    this.statPending.innerText = pending;
    this.statReceivables.innerText = `$${receivables.toLocaleString()}`;

    // Update Table
    this.tableRecent.innerHTML = this.state.data.map(item => `
      <tr class="group hover:bg-white/[0.02] transition-colors">
        <td class="py-4 text-neutral-400 font-mono text-xs">${item.date}</td>
        <td class="py-4 font-semibold">${item.customer}</td>
        <td class="py-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.status === 'Paid' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}">
            ${item.status}
          </span>
        </td>
        <td class="py-4 text-right font-mono font-bold">$${item.amount.toFixed(2)}</td>
      </tr>
    `).join('');
  }

  importDataset(type) {
    this.log(`Re-indexing ${type} dataset...`);
    setTimeout(() => this.log(`Dataset [${type}] refreshed with latest changes.`), 500);
  }

  prepareReport() {
    document.getElementById('report-date').innerText = `Generated: ${new Date().toLocaleDateString()}`;
    document.getElementById('rep-entities').innerText = this.state.data.length;
    const total = this.state.data.reduce((acc, curr) => acc + curr.amount, 0);
    document.getElementById('rep-gross').innerText = `$${total.toLocaleString()}`;

    const container = document.getElementById('report-table-container');
    container.innerHTML = `
      <table class="w-full text-left text-[10px] mt-8 border-t border-white/10">
        <thead class="text-neutral-500">
          <tr>
            <th class="py-2">ENTITY ID</th>
            <th class="py-2">CUSTOMER</th>
            <th class="py-2 text-right">VALUATION</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          ${this.state.data.map(d => `
            <tr>
              <td class="py-2 text-neutral-400">${d.id}</td>
              <td class="py-2">${d.customer}</td>
              <td class="py-2 text-right font-bold">$${d.amount.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  generatePDF() {
    const element = document.getElementById('report-template');
    const opt = {
      margin: 1,
      filename: 'Zoho_Insight_Report.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: '#050505' },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    this.btnGeneratePdf.innerText = "Generating...";
    html2pdf().set(opt).from(element).save().then(() => {
      this.btnGeneratePdf.innerText = "Download PDF Report";
    });
  }
}

// Global scope expose for inline onclicks
window.app = new ZohoInsightApp();
