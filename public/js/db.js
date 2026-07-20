// กำหนด URL ของ Server หลังบ้านที่นี่ (เช่นหาก Deploy บน Render ให้แก้เป็น https://nvc-shop-server.onrender.com เป็นต้น)
// หากรันใน localhost หรือคู่กับ server.js บนโฮสต์เดียวกัน ให้ปล่อยเป็นค่าว่าง ''
window.BACKEND_URL = window.location.hostname.includes('github.io') || window.location.hostname.includes('github.dev') || window.location.protocol === 'file:' 
    ? 'http://localhost:3000' 
    : '';

window.db = {
    usernameKey: 'nvc_username',
    adminSessionKey: 'nvc_admin_logged_in',
    notifiedKey: 'nvc_notified_orders',
    networkModeKey: 'nvc_network_mode',
    offlineQueueKey: 'nvc_offline_orders_queue',
    localDbKey: 'nvc_products_db',
    contactKey: 'nvc_contact',
    fullnameKey: 'nvc_fullname',
    sheetsUrlKey: 'nvc_sheets_url',
    emailKey: 'nvc_user_email',
    avatarKey: 'nvc_user_avatar',
    isLoggedInKey: 'nvc_is_logged_in',
    localUsersKey: 'nvc_local_users_db',

    isStaticMode() {
        return true; // We are in serverless mode now
    },

    getSheetsUrl() {
        const stored = localStorage.getItem(this.sheetsUrlKey);
        const oldDefault = 'https://script.google.com/macros/s/AKfycbwFgxTSLq2_C38_MBeudIXxqKGuvQ9KfdoqWarsNKYj/exec';
        const newDefault = 'https://script.google.com/macros/s/AKfycbx-DzLfzPDwr_SAB8CEu2J_ZvUv6n1Mv4wIcMixQXd0o9LNB_JVKx_Npz8LBKeVB6JavQ/exec';
        
        if (stored === oldDefault) {
            localStorage.setItem(this.sheetsUrlKey, newDefault);
            return newDefault;
        }
        return stored || newDefault;
    },

    saveSheetsUrl(url) {
        localStorage.setItem(this.sheetsUrlKey, url);
    },

    // Fetch products from Google Sheets or fall back to local storage
    async fetchProducts() {
        const sheetsUrl = this.getSheetsUrl();
        if (sheetsUrl && sheetsUrl.trim() !== '') {
            try {
                const res = await fetch(`${sheetsUrl}?action=readAll`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.products)) {
                        // If database is empty on Google Sheets, seed default products
                        if (data.products.length === 0) {
                            const defaultProds = this.resetLocalDatabase();
                            if (window.network && window.network.callSheets) {
                                window.network.callSheets('resetDatabase', { defaultProducts: defaultProds }).catch(e => console.error("Auto seed error:", e));
                            }
                            return defaultProds;
                        }

                        // Map flat products and orders into the nested products object
                        const ordersMap = {};
                        (data.orders || []).forEach(o => {
                            if (!ordersMap[o.productId]) {
                                ordersMap[o.productId] = [];
                            }
                            ordersMap[o.productId].push(o);
                        });
                        
                        const mergedProducts = data.products.map(p => ({
                            ...p,
                            orders: (ordersMap[p.id] || []).sort((a, b) => b.timestamp - a.timestamp)
                        }));
                        // Sync back to local storage as cache/fallback
                        this.saveLocalProducts(mergedProducts);
                        return mergedProducts;
                    }
                }
            } catch (e) {
                console.error("Failed to fetch from Google Sheets, using local storage cache:", e);
                return this.getLocalProducts();
            }
        }
        // Fallback to local storage simulation
        return this.getLocalProducts();
    },

    // --- LOCAL DATABASE SIMULATION FOR STATIC MODE ---
    getLocalProducts() {
        const isInit = localStorage.getItem('nvc_shop_db_initialized') === 'true';
        const data = localStorage.getItem(this.localDbKey);
        if (isInit && data) {
            try {
                return JSON.parse(data);
            } catch (e) {
                console.error("Failed to parse local database, resetting...");
            }
        }
        return this.resetLocalDatabase();
    },

    saveLocalProducts(products) {
        localStorage.setItem(this.localDbKey, JSON.stringify(products));
    },

    saveLocalOrder(productId, customerName, type, quantity, fullname, contact, timestamp, connection = 'ออนไลน์') {
        const products = this.getLocalProducts();
        const product = products.find(x => x.id === productId);
        if (product && product.status !== 'sold_out' && product.status !== 'booked') {
            const qty = parseInt(quantity || 1, 10);
            if (product.stock < qty) return false;

            const newOrder = {
                id: 'ord_' + Math.floor(Math.random() * 1000000),
                productId: productId,
                type: type, // 'purchase' or 'booking'
                quantity: qty,
                name: customerName,
                fullname: fullname,
                contact: contact,
                status: 'pending',
                timestamp: timestamp || Date.now(),
                connection: connection
            };

            if (!product.orders) product.orders = [];
            product.orders.unshift(newOrder);

            product.stock -= qty;
            if (product.stock <= 0) {
                product.status = type === 'booking' ? 'booked' : 'sold_out';
            }

            this.saveLocalProducts(products);
            return true;
        }
        return false;
    },

    saveLocalProduct(productData) {
        const products = this.getLocalProducts();
        const price = parseInt(productData.price || 0, 10);
        const stock = parseInt(productData.stock || 1, 10);
        const status = stock > 0 ? 'available' : 'sold_out';

        const newProd = {
            id: 'prod_' + Math.floor(Math.random() * 1000000),
            name: productData.name,
            category: productData.category || 'ทั่วไป',
            description: productData.description,
            price: price,
            stock: stock,
            images: productData.images,
            status: status,
            orders: []
        };
        products.push(newProd);
        this.saveLocalProducts(products);
        return newProd;
    },

    deleteLocalProduct(id) {
        let products = this.getLocalProducts();
        products = products.filter(x => x.id !== id);
        this.saveLocalProducts(products);
    },

    updateLocalOrderStatus(orderId, status) {
        const products = this.getLocalProducts();
        let foundOrder = null;
        let foundProduct = null;

        for (const p of products) {
            const o = p.orders.find(ord => ord.id === orderId);
            if (o) {
                foundOrder = o;
                foundProduct = p;
                break;
            }
        }

        if (foundOrder && foundProduct) {
            const oldStatus = foundOrder.status;
            foundOrder.status = status;

            // Handle stock restoral if cancelled
            if (status === 'cancelled' && oldStatus !== 'cancelled') {
                foundProduct.stock += foundOrder.quantity;
                if (foundProduct.stock > 0) {
                    foundProduct.status = 'available';
                }
            }

            // Handle stock reduction if re-enabled from cancelled
            if (oldStatus === 'cancelled' && status !== 'cancelled') {
                foundProduct.stock = Math.max(0, foundProduct.stock - foundOrder.quantity);
                if (foundProduct.stock <= 0) {
                    foundProduct.status = foundOrder.type === 'booking' ? 'booked' : 'sold_out';
                }
            }

            this.saveLocalProducts(products);
            return true;
        }
        return false;
    },

    resetLocalDatabase() {
        localStorage.setItem('nvc_shop_db_initialized', 'true');
        const defaultProducts = [
        ];
        this.saveLocalProducts(defaultProducts);
        return defaultProducts;
    },

    // --- OTHER CORE SETTINGS & AUTH ---
    isLoggedIn() {
        return localStorage.getItem(this.isLoggedInKey) === 'true';
    },

    isRegistered() {
        return this.isLoggedIn();
    },

    getUsername() {
        return localStorage.getItem(this.usernameKey) || '';
    },

    getEmail() {
        return localStorage.getItem(this.emailKey) || '';
    },

    getAvatar() {
        return localStorage.getItem(this.avatarKey) || '';
    },

    getContact() {
        return this.getEmail();
    },

    getFullname() {
        return this.getUsername();
    },

    saveUserSession(username, email, avatar) {
        localStorage.setItem(this.usernameKey, username);
        localStorage.setItem(this.emailKey, email);
        localStorage.setItem(this.avatarKey, avatar);
        localStorage.setItem(this.isLoggedInKey, 'true');
    },

    clearUserSession() {
        localStorage.removeItem(this.usernameKey);
        localStorage.removeItem(this.emailKey);
        localStorage.removeItem(this.avatarKey);
        localStorage.setItem(this.isLoggedInKey, 'false');
    },

    // --- LOCAL DB SIMULATION FOR OFFLINE USER REGISTRATION & LOGIN ---
    getLocalUsers() {
        const data = localStorage.getItem(this.localUsersKey);
        return data ? JSON.parse(data) : [];
    },

    saveLocalUsers(users) {
        localStorage.setItem(this.localUsersKey, JSON.stringify(users));
    },

    registerLocalUser(user) {
        const users = this.getLocalUsers();
        if (users.some(u => u.username.toLowerCase() === user.username.toLowerCase())) {
            return { error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' };
        }
        if (user.email && user.email.trim() !== '' && users.some(u => u.email && u.email.toLowerCase() === user.email.toLowerCase())) {
            return { error: 'อีเมลนี้ถูกใช้งานแล้ว' };
        }
        users.push({
            username: user.username,
            password: user.password,
            email: user.email,
            avatar: user.avatar || '',
            createdAt: new Date().toISOString()
        });
        this.saveLocalUsers(users);
        return { success: true };
    },

    loginLocalUser(username, password) {
        const users = this.getLocalUsers();
        const found = users.find(u => 
            (u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === username.toLowerCase()) && u.password === password
        );
        if (found) {
            return {
                success: true,
                user: {
                    username: found.username,
                    email: found.email,
                    avatar: found.avatar
                }
            };
        }
        return { error: 'ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง' };
    },

    isAdminLoggedIn() {
        return sessionStorage.getItem(this.adminSessionKey) === 'true';
    },

    setAdminLoggedIn(val) {
        sessionStorage.setItem(this.adminSessionKey, val ? 'true' : 'false');
    },

    getNotifiedOrders() {
        const data = localStorage.getItem(this.notifiedKey);
        return data ? JSON.parse(data) : [];
    },

    saveNotifiedOrders(list) {
        localStorage.setItem(this.notifiedKey, JSON.stringify(list));
    },

    getNetworkMode() {
        return localStorage.getItem(this.networkModeKey) || 'online';
    },

    setNetworkMode(mode) {
        localStorage.setItem(this.networkModeKey, mode);
    },

    getOfflineQueue() {
        const data = localStorage.getItem(this.offlineQueueKey);
        return data ? JSON.parse(data) : [];
    },

    saveOfflineQueue(queue) {
        localStorage.setItem(this.offlineQueueKey, JSON.stringify(queue));
    }
};
