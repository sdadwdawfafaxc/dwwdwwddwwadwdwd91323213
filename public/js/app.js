// NVC Shop & Book Core Application Coordinator (Client-side)
class ShopApp {
    constructor() {
        this.products = [];
        this.username = '';
        this.isAdminLoggedIn = false;
        this.notifiedOrders = [];
        
        this.currentView = 'home';
        this.activeDetailId = null;
        this.uploadedImages = [];
        this.logoClickCount = 0;
        this.logoClickTimer = null;
        this.pollingInterval = null;

        // Avatar presets
        this.avatarPresets = [
            `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%230ea5e9"><circle cx="12" cy="12" r="12"/><path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 10c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" fill="white"/></svg>`,
            `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2310b981"><circle cx="12" cy="12" r="12"/><path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 10c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" fill="white"/></svg>`,
            `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238b5cf6"><circle cx="12" cy="12" r="12"/><path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 10c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" fill="white"/></svg>`,
            `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f97316"><circle cx="12" cy="12" r="12"/><path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 10c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" fill="white"/></svg>`,
            `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f43f5e"><circle cx="12" cy="12" r="12"/><path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 10c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" fill="white"/></svg>`
        ];
        this.selectedAvatar = this.avatarPresets[0];
    }


    startSheetsPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        // Poll Google Sheets every 8 seconds for real-time updates
        this.pollingInterval = setInterval(async () => {
            await this.handleDatabaseChangedExternal(null, true);
        }, 8000);
    }


    async init() {
        // Load initial state
        this.username = window.db.getUsername();
        this.isAdminLoggedIn = window.db.isAdminLoggedIn();
        this.notifiedOrders = window.db.getNotifiedOrders();
        
        // Update user auth profile details
        this.updateUserBadge();
        this.populateAvatarPresets();

        // Fetch products from database
        this.products = await window.db.fetchProducts();

        // Initialize Network Module (registers the message callback)
        window.network.init((data) => this.handleBroadcastMessage(data));

        // Start Auto-Polling
        this.startSheetsPolling();

        // Bind logo secret action
        const logo = document.getElementById('main-logo');
        if (logo) {
            logo.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogoClick();
            });
        }

        // Secret key shortcut: Ctrl + Shift + A
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                this.navigateTo('#/admin');
                this.showToast('โหมดลับแอดมิน!', 'เปิดหน้าต่างล็อกอินผู้ดูแลระบบ', 'info');
            }
        });

        // Listen for routing changes
        window.addEventListener('hashchange', () => this.handleRouting());

        // Run routing once at launch
        this.handleRouting();
    }

    // --- RE-RENDER & SYNC HELPERS ---
    async handleDatabaseChangedExternal(activeProductId = null, fetchFromServer = true) {
        if (fetchFromServer) {
            const rawProducts = await window.db.fetchProducts();
            
            // Client-side privacy filter: strip contact details for non-admin users
            if (this.currentView === 'admin' && this.isAdminLoggedIn) {
                this.products = rawProducts;
            } else {
                this.products = rawProducts.map(p => ({
                    ...p,
                    orders: (p.orders || []).map(o => ({
                        id: o.id,
                        productId: o.productId,
                        type: o.type,
                        quantity: o.quantity,
                        name: o.name,
                        status: o.status,
                        timestamp: o.timestamp,
                        connection: o.connection || 'ออนไลน์'
                    }))
                }));
            }
        }
        
        if (this.currentView === 'home') {
            this.renderHome();
        } else if (this.currentView === 'detail' && (activeProductId === null || this.activeDetailId === activeProductId)) {
            this.renderDetail();
        } else if (this.currentView === 'admin' && this.isAdminLoggedIn) {
            this.renderAdminDashboard();
        }
    }

    // --- ROUTER ---
    showView(viewName, params = {}) {
        this.currentView = viewName;
        
        // Update Nav Menu states
        document.querySelectorAll('.nav-links button').forEach(btn => btn.classList.remove('active'));
        if (viewName === 'home') {
            const btnHome = document.getElementById('nav-home');
            if (btnHome) btnHome.classList.add('active');
        }

        // Hide all views first
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));

        if (viewName === 'home') {
            document.getElementById('view-home').classList.add('active');
            this.renderHome();
        } else if (viewName === 'detail') {
            this.activeDetailId = params.id;
            document.getElementById('view-detail').classList.add('active');
            this.renderDetail();
        } else if (viewName === 'admin') {
            if (this.isAdminLoggedIn) {
                document.getElementById('view-admin-dashboard').classList.add('active');
                this.handleDatabaseChangedExternal();
                setTimeout(() => {
                    const input = document.getElementById('sheets-url-input');
                    if (input) input.value = window.db.getSheetsUrl();
                }, 100);
            } else {
                document.getElementById('view-admin-login').classList.add('active');
            }
        }
    }

    handleRouting() {
        const hash = window.location.hash;
        if (hash.startsWith('#/product/')) {
            const id = hash.replace('#/product/', '');
            this.showView('detail', { id });
        } else if (hash === '#/admin') {
            this.showView('admin');
        } else {
            this.showView('home');
        }
    }

    navigateTo(hash) {
        window.location.hash = hash;
        this.handleRouting();
    }

    // --- RENDER PASS-THROUGH ---
    renderHome() {
        window.renderer.renderHome(this.products);
    }

    renderDetail() {
        const item = this.products.find(x => x.id === this.activeDetailId);
        window.renderer.renderDetail(item, this.username);
    }

    renderAdminDashboard() {
        window.renderer.renderAdminDashboard(this.products, this.username);
    }

    // --- SECRET ADMIN ENTRY ---
    handleLogoClick() {
        this.logoClickCount++;
        clearTimeout(this.logoClickTimer);
        
        if (this.logoClickCount >= 5) {
            this.logoClickCount = 0;
            this.navigateTo('#/admin');
            this.showToast('โหมดลับแอดมิน!', 'เปิดหน้าต่างล็อกอินผู้ดูแลระบบ', 'info');
        } else {
            this.logoClickTimer = setTimeout(() => {
                this.logoClickCount = 0;
            }, 2000);
        }
    }

    // --- USER PROFILE & AUTHENTICATION ---
    updateUserBadge() {
        const container = document.getElementById('user-badge-container');
        if (!container) return;

        if (window.db.isLoggedIn()) {
            const username = window.db.getUsername();
            const avatar = window.db.getAvatar() || this.avatarPresets[0];
            container.innerHTML = `
                <div class="user-profile-badge">
                    <img class="user-profile-avatar" src="${avatar}" alt="Avatar">
                    <span style="font-weight:600;">${username}</span>
                    <button class="btn-logout" onclick="app.logoutUser()">ออกจากระบบ</button>
                </div>
            `;
        } else {
            container.innerHTML = `
                <button class="btn btn-ghost" style="border: 1px solid rgba(255,255,255,0.1); padding: 6px 12px; font-size: 13px;" onclick="app.openAuthModal('login')">
                    🔑 เข้าสู่ระบบ / สมัครสมาชิก
                </button>
            `;
        }
    }

    openAuthModal(tab = 'login') {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;

        modal.classList.add('active');
        this.switchAuthTab(tab);
    }

    closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    switchAuthTab(tab) {
        const tabLoginBtn = document.getElementById('tab-login-btn');
        const tabRegisterBtn = document.getElementById('tab-register-btn');
        const loginContent = document.getElementById('auth-login-content');
        const registerContent = document.getElementById('auth-register-content');

        if (tab === 'login') {
            tabLoginBtn.classList.add('active');
            tabRegisterBtn.classList.remove('active');
            loginContent.classList.add('active');
            registerContent.classList.remove('active');
            document.getElementById('login-username').focus();
        } else {
            tabLoginBtn.classList.remove('active');
            tabRegisterBtn.classList.add('active');
            loginContent.classList.remove('active');
            registerContent.classList.add('active');
            document.getElementById('reg-username').focus();
        }
    }

    populateAvatarPresets() {
        const container = document.getElementById('avatar-presets-list');
        if (!container) return;

        container.innerHTML = '';
        this.avatarPresets.forEach((preset, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `avatar-preset-btn ${this.selectedAvatar === preset ? 'active' : ''}`;
            btn.onclick = () => this.selectPresetAvatar(index);
            btn.innerHTML = `<img src="${preset}" alt="Preset ${index + 1}">`;
            container.appendChild(btn);
        });
        
        // Update large preview
        const preview = document.getElementById('reg-avatar-preview');
        if (preview) preview.src = this.selectedAvatar;
    }

    selectPresetAvatar(index) {
        this.selectedAvatar = this.avatarPresets[index];
        
        // Re-render presets highlight
        document.querySelectorAll('.avatar-preset-btn').forEach((btn, idx) => {
            if (idx === index) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const preview = document.getElementById('reg-avatar-preview');
        if (preview) preview.src = this.selectedAvatar;
    }

    handleAvatarFileChange(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.selectedAvatar = e.target.result;
            
            // Remove active highlight from presets
            document.querySelectorAll('.avatar-preset-btn').forEach(btn => btn.classList.remove('active'));

            const preview = document.getElementById('reg-avatar-preview');
            if (preview) preview.src = this.selectedAvatar;
        };
        reader.readAsDataURL(file);
    }

    async handleLoginSubmit(event) {
        event.preventDefault();
        const usernameInput = document.getElementById('login-username').value.trim();
        const passwordInput = document.getElementById('login-password').value;

        if (!usernameInput || !passwordInput) {
            this.showToast('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุข้อมูลทุกช่อง', 'warning');
            return;
        }

        this.showToast('เข้าสู่ระบบ', 'กำลังเชื่อมต่อและยืนยันข้อมูล...', 'info', 1500);

        const result = await window.network.sendLoginUser(usernameInput, passwordInput);

        if (result && result.success && result.user) {
            window.db.saveUserSession(result.user.username, result.user.email, result.user.avatar);
            this.username = result.user.username;
            
            this.updateUserBadge();
            this.closeAuthModal();
            this.showToast('เข้าสู่ระบบสำเร็จ', `ยินดีต้อนรับกลับคุณ ${this.username}!`, 'success');
            
            // Clear input fields
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
            
            this.handleDatabaseChangedExternal(this.activeDetailId, false);
        } else {
            this.showToast('เข้าสู่ระบบล้มเหลว', result.error || 'ชื่อผู้ใช้ หรือ รหัสผ่านไม่ถูกต้อง', 'danger');
        }
    }

    async manualRefresh() {
        this.showToast('รีเฟรชข้อมูล', 'กำลังปรับปรุงข้อมูลร้านค้าล่าสุดจากเซิร์ฟเวอร์...', 'info', 1500);
        try {
            await this.handleDatabaseChangedExternal(null, true);
            this.showToast('สำเร็จ', 'อัปเดตข้อมูลสินค้าเรียบร้อยแล้ว', 'success');
        } catch (e) {
            this.showToast('ล้มเหลว', `ไม่สามารถเชื่อมต่อข้อมูลได้: ${e.message}`, 'danger');
        }
    }

    async handleRegisterSubmit(event) {
        event.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;

        if (!username || !password) {
            this.showToast('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุชื่อผู้ใช้งานและรหัสผ่าน', 'warning');
            return;
        }

        // Simple validation
        if (username.length < 3) {
            this.showToast('ข้อมูลไม่ถูกต้อง', 'ชื่อผู้ใช้งานต้องมีอย่างน้อย 3 ตัวอักษร', 'warning');
            return;
        }

        this.showToast('สมัครสมาชิก', 'กำลังบันทึกข้อมูลสมาชิกใหม่...', 'info', 1500);

        const userData = {
            username,
            email: '',
            password,
            avatar: this.avatarPresets[0]
        };

        const result = await window.network.sendRegisterUser(userData);

        if (result && result.success) {
            // Auto log in after registration
            window.db.saveUserSession(username, '', this.avatarPresets[0]);
            this.username = username;

            this.updateUserBadge();
            this.closeAuthModal();
            this.showToast('สมัครสมาชิกสำเร็จ', `ยินดีต้อนรับคุณ ${this.username} เข้าสู่ระบบ!`, 'success');

            // Clear input fields
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-password').value = '';
            
            this.handleDatabaseChangedExternal(this.activeDetailId, false);
        } else {
            this.showToast('สมัครสมาชิกไม่สำเร็จ', result.error || 'เกิดข้อผิดพลาดในการลงทะเบียน', 'danger');
        }
    }

    logoutUser() {
        window.db.clearUserSession();
        this.username = '';
        this.updateUserBadge();
        this.showToast('ออกจากระบบ', 'คุณได้ออกจากระบบผู้ใช้งานแล้ว', 'info');
        this.handleDatabaseChangedExternal(this.activeDetailId, false);
    }

    // --- ADMIN AUTH ---
    loginAdmin() {
        const passwordInput = document.getElementById('admin-password');
        const password = passwordInput.value;
        if (password === 'adminplayer112') {
            this.isAdminLoggedIn = true;
            window.db.setAdminLoggedIn(true);
            passwordInput.value = '';
            this.showToast('เข้าสู่ระบบสำเร็จ', 'ยินดีต้อนรับสู่แผงควบคุมผู้ดูแลระบบ', 'success');
            this.showView('admin');
        } else {
            this.showToast('รหัสผ่านไม่ถูกต้อง', 'กรุณาลองใหม่อีกครั้ง', 'warning');
            passwordInput.focus();
        }
    }

    logoutAdmin() {
        this.isAdminLoggedIn = false;
        window.db.setAdminLoggedIn(false);
        this.showToast('ออกจากระบบ', 'ออกจากแผงควบคุมผู้ดูแลระบบแล้ว', 'info');
        this.navigateTo('#/');
    }

    // --- BUYING & BOOKING PROCESS ---
    placeOrder() {
        if (!window.db.isLoggedIn()) {
            this.showToast('กรุณาลงชื่อเข้าใช้', 'กรุณาเข้าสู่ระบบผู้ใช้งานเพื่อทำการสั่งซื้อหรือจองสินค้า', 'warning');
            this.openAuthModal('login');
            return;
        }

        const typeSelect = document.getElementById('order-type-select');
        const qtyInput = document.getElementById('order-quantity-input');
        if (!typeSelect || !qtyInput) return;

        const type = typeSelect.value;
        const qty = parseInt(qtyInput.value, 10);

        const item = this.products.find(x => x.id === this.activeDetailId);
        if (!item) return;

        if (item.stock <= 0) {
            this.showToast('สินค้าหมด', 'ขออภัย สินค้านี้หมดชั่วคราว ไม่สามารถทำรายการได้', 'warning');
            return;
        }

        if (isNaN(qty) || qty <= 0 || qty > item.stock) {
            this.showToast('จำนวนไม่ถูกต้อง', `ระบุจำนวนระหว่าง 1 ถึง ${item.stock} ชิ้น`, 'warning');
            return;
        }

        // Delegate to network manager (handles socket emit or local fallback)
        window.network.sendOrder(item.id, type, qty, Date.now());
    }

    adjustOrderQuantity(amount) {
        const qtyInput = document.getElementById('order-quantity-input');
        if (!qtyInput) return;

        const item = this.products.find(x => x.id === this.activeDetailId);
        if (!item) return;

        let val = parseInt(qtyInput.value, 10);
        if (isNaN(val)) val = 1;
        val += amount;

        if (val < 1) val = 1;
        if (val > item.stock) val = item.stock;

        qtyInput.value = val;
    }

    handleOrderTypeChange() {
        const typeSelect = document.getElementById('order-type-select');
        const btn = document.getElementById('btn-submit-order');
        if (!typeSelect || !btn) return;

        if (typeSelect.value === 'booking') {
            btn.textContent = 'ยืนยันการจองสินค้าล่วงหน้า';
            btn.style.backgroundColor = 'var(--primary)';
            btn.style.boxShadow = '0 4px 14px var(--primary-glow)';
        } else {
            btn.textContent = 'ยืนยันการสั่งซื้อสินค้า';
            btn.style.backgroundColor = 'var(--secondary)';
            btn.style.boxShadow = '0 4px 14px var(--secondary-glow)';
        }
    }

    // --- BROADCAST SYNC RECEIVERS ---
    handleBroadcastMessage(msg) {
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'NEW_ORDER':
                this.syncNewOrder(msg.payload);
                break;
            case 'NEW_PRODUCT':
                this.syncNewProduct(msg.payload);
                break;
            case 'ORDER_STATUS_UPDATED':
                this.syncOrderStatusUpdated(msg.payload);
                break;
            case 'DELETE_PRODUCT':
                this.syncDeleteProduct(msg.payload);
                break;
            case 'DATABASE_SYNC':
                this.syncDatabase(msg.payload);
                break;
        }
    }

    syncNewOrder(payload) {
        // Notification toast for all users
        const typeText = payload.order.type === 'booking' ? 'จองสินค้า' : 'สั่งซื้อสินค้า';
        const msg = `คุณ ${payload.order.name} ได้ทำการ${typeText} "${payload.orderName}" จำนวน ${payload.order.quantity} ชิ้น`;
        this.showToast('ทำรายการใหม่!', msg, 'info', 6000);

        // Fetch detailed data for admin
        const isAdminMode = this.currentView === 'admin' && this.isAdminLoggedIn;
        this.handleDatabaseChangedExternal(payload.productId, isAdminMode);
    }

    syncNewProduct(newProd) {
        if (this.products.some(x => x.id === newProd.id)) return;
        this.products.push(newProd);
        this.handleDatabaseChangedExternal(null, false);
        this.showToast('🆕 สินค้ามาใหม่!', `แอดมินได้เพิ่มสินค้าใหม่: "${newProd.name}"`, 'success', 6000);
    }

    syncOrderStatusUpdated(payload) {
        let statusLabel = 'รอตรวจสอบ';
        if (payload.status === 'confirmed') statusLabel = 'ยืนยันการซื้อ/จองแล้ว';
        if (payload.status === 'completed') statusLabel = 'ทำรายการเสร็จสมบูรณ์';
        if (payload.status === 'cancelled') statusLabel = 'ยกเลิกรายการ';

        const toastType = payload.status === 'cancelled' ? 'warning' : 'success';
        this.showToast('อัปเดตสถานะออเดอร์', `ออเดอร์ของคุณหรือลูกค้าได้รับการปรับสถานะเป็น: ${statusLabel}`, toastType, 6000);

        // Fetch updated details from server
        const isAdminMode = this.currentView === 'admin' && this.isAdminLoggedIn;
        this.handleDatabaseChangedExternal(payload.productId, isAdminMode);
    }

    syncDeleteProduct(payload) {
        const index = this.products.findIndex(x => x.id === payload.id);
        if (index === -1) return;
        this.products.splice(index, 1);
        
        if (this.activeDetailId === payload.id) {
            this.navigateTo('#/');
            this.showToast('สินค้าถูกลบ', 'สินค้านี้ถูกนำออกจากระบบแล้ว', 'warning');
        } else {
            this.handleDatabaseChangedExternal(null, false);
        }
    }

    syncDatabase(data) {
        this.products = data;
        const isAdminMode = this.currentView === 'admin' && this.isAdminLoggedIn;
        this.handleDatabaseChangedExternal(this.activeDetailId, isAdminMode);
    }

    // --- ADMIN PRODUCT & ORDER ACTIONS ---
    showConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            if (!modal) {
                resolve(false);
                return;
            }

            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;

            const btnOk = document.getElementById('confirm-ok-btn');
            const btnCancel = document.getElementById('confirm-cancel-btn');

            // Clean up event listeners by cloning
            const newBtnOk = btnOk.cloneNode(true);
            const newBtnCancel = btnCancel.cloneNode(true);
            btnOk.parentNode.replaceChild(newBtnOk, btnOk);
            btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

            modal.classList.add('active');

            newBtnOk.addEventListener('click', () => {
                modal.classList.remove('active');
                resolve(true);
            });

            newBtnCancel.addEventListener('click', () => {
                modal.classList.remove('active');
                resolve(false);
            });
        });
    }

    async deleteProduct(id) {
        const confirmed = await this.showConfirm('ลบสินค้า', 'คุณแน่ใจหรือไม่ที่จะลบสินค้าชิ้นนี้? ประวัติคำสั่งซื้อทั้งหมดจะหายไป');
        if (confirmed) {
            window.network.sendDeleteProduct(id);
        }
    }

    async updateOrderStatus(orderId, status) {
        let textStatus = 'ยืนยันรายการ';
        if (status === 'completed') textStatus = 'ปรับสถานะเป็นเสร็จสมบูรณ์';
        if (status === 'cancelled') textStatus = 'ยกเลิกรายการสั่งซื้อ/จองนี้';

        const confirmed = await this.showConfirm('อัปเดตสถานะออเดอร์', `ต้องการ "${textStatus}" ใช่หรือไม่?`);
        if (confirmed) {
            window.network.sendUpdateOrderStatus(orderId, status);
        }
    }

    // --- DB ACTIONS ---
    saveSheetsUrl() {
        const input = document.getElementById('sheets-url-input');
        if (!input) return;
        const url = input.value.trim();
        window.db.saveSheetsUrl(url);
        this.showToast('บันทึกสำเร็จ', 'อัปเดต URL ของ Google Sheets เรียบร้อยแล้ว ระบบกำลังดึงข้อมูลใหม่...', 'success');
        this.handleDatabaseChangedExternal(null, true);
    }

    exportDatabase() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.products, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `nvc_shop_backup_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        this.showToast('ส่งออกข้อมูลสำเร็จ', 'ข้อมูลถูกเซฟเก็บเป็นไฟล์ JSON เรียบร้อย', 'success');
    }

    importDatabase(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (Array.isArray(parsed)) {
                    window.network.sendDatabaseSync(parsed);
                    this.showToast('นำเข้าข้อมูลสำเร็จ', 'กำลังอัปโหลดฐานข้อมูลขึ้นระบบ...', 'success');
                } else {
                    this.showToast('รูปแบบไฟล์ไม่ถูกต้อง', 'กรุณาอัปโหลดไฟล์ JSON ที่มีรูปแบบที่ถูกต้อง', 'warning');
                }
            } catch (err) {
                this.showToast('การนำเข้าไฟล์ล้มเหลว', 'ไม่สามารถอ่านข้อมูลในไฟล์ได้', 'danger');
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }


    // --- UPLOADS & NEW PRODUCTS ---
    handleImageSelection(event) {
        const files = Array.from(event.target.files);
        const container = document.getElementById('upload-thumbs-container');
        if (container) container.innerHTML = '';
        this.uploadedImages = [];

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;
                this.uploadedImages.push(base64);

                const img = document.createElement('img');
                img.className = 'upload-thumb';
                img.src = base64;
                if (container) container.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    }

    handleNewProduct(event) {
        event.preventDefault();

        if (!this.isAdminLoggedIn) {
            this.showToast('ไม่มีสิทธิ์เข้าถึง', 'หน้านี้สำหรับแอดมินเท่านั้น', 'warning');
            this.navigateTo('#/');
            return;
        }

        const name = document.getElementById('prod-name').value.trim();
        const category = document.getElementById('prod-category').value.trim();
        const stock = parseInt(document.getElementById('prod-stock').value, 10);
        const price = parseInt(document.getElementById('prod-price').value, 10);
        const description = document.getElementById('prod-desc').value.trim();

        if (!name || isNaN(stock) || isNaN(price) || !description) {
            this.showToast('ข้อมูลไม่ครบถ้วน', 'โปรดกรอกข้อมูลฟิลด์ที่บังคับให้ครบ', 'warning');
            return;
        }

        if (this.uploadedImages.length === 0) {
            this.showToast('จำเป็นต้องมีรูปภาพ', 'กรุณาอัปโหลดรูปภาพสินค้าอย่างน้อย 1 รูป', 'warning');
            return;
        }

        window.network.sendNewProduct({
            name,
            category,
            price,
            stock,
            description,
            images: this.uploadedImages
        });
    }

    resetAdminForm() {
        const form = document.getElementById('add-product-form');
        if (form) form.reset();
        const thumbs = document.getElementById('upload-thumbs-container');
        if (thumbs) thumbs.innerHTML = '';
        this.uploadedImages = [];
    }

    // --- TOASTS ---
    showToast(title, message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${message}</div>
            </div>
            <span class="toast-close" onclick="this.parentElement.remove()">×</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast && toast.parentElement) {
                toast.style.animation = 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse';
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
}

// Global Instantiate
window.app = new ShopApp();
document.addEventListener('DOMContentLoaded', () => {
    window.app.init();
});
